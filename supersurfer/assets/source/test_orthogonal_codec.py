import copy
import torch
import pytest
from test_joint_codec import historical_checkpoint
from simple_vla import orthogonal_codec, orthogonal_checkpoint
from util.compact_future_codec import FrozenChannelCodec

@pytest.mark.parametrize("channels,rank,tile", [(384,64,(3,2)),(196,16,(3,4))])
def test_inverse_projection_gradient_and_ema(channels,rank,tile):
    torch.manual_seed(17)
    basis=torch.linalg.qr(torch.randn(channels,rank),mode="reduced")[0]
    frozen=FrozenChannelCodec(torch.randn(192,channels),basis,grid=(12,16),tile=tile)
    codec=orthogonal_codec.OrthogonalChannelCodec(frozen)
    x=torch.randn(1,4,192,channels)
    torch.testing.assert_close(codec.encode(x),frozen.encode(x),rtol=2e-5,atol=3e-6)
    torch.testing.assert_close(codec.decode(codec.encode(x)),frozen.decode(frozen.encode(x)),rtol=2e-5,atol=3e-6)
    optimizer=torch.optim.AdamW(codec.parameters(),lr=.001)
    for i in range(3):
        optimizer.zero_grad()
        loss=(codec.decode(codec.encode(x))-x).square().mean()
        loss.backward()
        assert torch.isfinite(codec.projection.learned_basis.grad).all()
        assert codec.projection.learned_basis.grad.norm()>0
        optimizer.step()
    U=codec.effective_basis()
    torch.testing.assert_close(U.T@U,torch.eye(rank),rtol=0,atol=2e-6)
    z=torch.randn_like(codec.encode(x))
    torch.testing.assert_close(codec.encode(codec.decode(z)),z,rtol=2e-5,atol=4e-6)
    averaged=copy.deepcopy(codec)
    with torch.no_grad(): averaged.projection.learned_basis.lerp_(basis,.9)
    U=averaged.effective_basis()
    torch.testing.assert_close(U.T@U,torch.eye(rank),rtol=0,atol=2e-6)
    torch.testing.assert_close(codec.encode_noise(x),codec.encode(x),rtol=0,atol=0)
    assert not torch.allclose(codec.decode(codec.encode(x)),x)
    assert list(dict(codec.named_parameters()))==["projection.learned_basis"]

def test_migration_and_snapshot_preserve_existing_state():
    parent,plan=historical_checkpoint()
    raw,ema,opt,names,update=orthogonal_checkpoint.migrate_parent(parent,plan,"cpu")
    assert update==89738
    assert len(names)==len(parent["optimizer_parameter_names"])+2
    for name in parent["optimizer_parameter_names"]:
        torch.testing.assert_close(raw.state_dict()[name],parent["raw"]["state_dict"][name],rtol=0,atol=0)
        torch.testing.assert_close(ema.state_dict()[name],parent["ema"]["state_dict"][name],rtol=0,atol=0)
    new=opt.state_dict()
    for key,value in parent["optimizer"]["state"].items():
        for k,v in value.items(): torch.testing.assert_close(new["state"][key][k],v,rtol=0,atol=0)
    restored=orthogonal_codec.load_snapshot(orthogonal_codec.model_snapshot(raw,{"test":True}))
    for name,value in raw.state_dict().items():
        if torch.is_tensor(value): torch.testing.assert_close(restored.state_dict()[name],value,rtol=0,atol=0)

def test_rank_deficiency_fails():
    frozen=FrozenChannelCodec(torch.zeros(192,6),torch.eye(6)[:,:2],grid=(12,16),tile=(3,2))
    codec=orthogonal_codec.OrthogonalChannelCodec(frozen)
    with torch.no_grad(): codec.projection.learned_basis.zero_()
    with pytest.raises(FloatingPointError): codec.effective_basis()

def test_policy_positions_masks_and_train_generate_noise(monkeypatch):
    from test_simple_vla import small_field_model, field_batch
    from simple_vla import fields
    from util.compact_future_random import KeyedRandom
    frozen=small_field_model("compact")
    learned=copy.deepcopy(frozen)
    orthogonal_codec.enable_orthogonal_codecs(learned)
    batch=field_batch()
    history,futures,validity=learned.batch_fields(batch)
    args=(history,futures,batch["actions"],batch["proprio"],batch["task_id"])
    old_blocks,_,_=fields.training_blocks(frozen.train(),*args,stream="action",random_key=("test",),seed=42)
    new_blocks,_,_=fields.training_blocks(learned.train(),*args,stream="action",random_key=("test",),seed=42)
    assert len(old_blocks)==len(new_blocks)
    frozen.finalize_blocks(old_blocks)
    learned.finalize_blocks(new_blocks)
    torch.testing.assert_close(learned.causal_mask(new_blocks),frozen.causal_mask(old_blocks),rtol=0,atol=0)
    for name in ("dino","depth","tracks"):
        assert learned.codecs[name].packing==frozen.codecs[name].packing
        torch.testing.assert_close(learned.codecs[name].packing.rope_anchors()[0],frozen.codecs[name].packing.rope_anchors()[0],rtol=0,atol=0)
        torch.testing.assert_close(learned.codecs[name].packing.rope_anchors()[1],frozen.codecs[name].packing.rope_anchors()[1],rtol=0,atol=0)
        random=KeyedRandom(42,("noise-contract",))
        for purpose in ("conditioning_noise","query_noise","generation"):
            epsilon=random.normal((len(batch["proprio"]),learned.cfg.obs_future,learned.cfg.n_patches,learned.native_width[name]),modality=name,purpose=purpose,device="cpu")
            torch.testing.assert_close(fields.native_noise(learned,name,random,purpose,batch["proprio"]),learned.codecs[name].encode(epsilon),rtol=0,atol=0)
    # Masked future values cannot contribute to the native loss.
    prediction=torch.randn(2,2,8,6)
    target=torch.randn_like(prediction)
    mask=torch.tensor([[1,0],[0,0]])
    expected,_,_=fields.valid_example_loss(prediction,target,mask,torch.ones(2))
    target[:,1]+=100
    target[1]+=100
    actual,_,_=fields.valid_example_loss(prediction,target,mask,torch.ones(2))
    torch.testing.assert_close(actual,expected,rtol=0,atol=0)
    observed=[]
    original=fields.native_noise
    def recorded(model,name,random,purpose,proprio):
        observed.append((name,purpose))
        return original(model,name,random,purpose,proprio)
    monkeypatch.setattr(fields,"native_noise",recorded)
    fields.generate(learned.eval(),history,batch["proprio"],batch["task_id"],random_key=("generation-test",))
    assert observed==[(n,"generation") for n in ("tracks","dino","depth","action")]


def test_whole_training_recovery_and_ema_inference(tmp_path):
    from dataclasses import asdict
    from test_simple_vla import field_batch
    from simple_vla.orthogonal_train import update_model
    from simple_vla.infer import load_field_checkpoint
    from util.compact_future_training import capture_random_state
    parent,plan=historical_checkpoint()
    model,ema,optimizer,names,start=orthogonal_checkpoint.migrate_parent(parent,plan,"cpu")
    class Reader:
        def draw(self,stream,size,*,random_key):
            return field_batch(size),[str(i) for i in range(size)]
    reader=Reader()
    config=dict(target_update=128000,reconstruction_weight=1,mode="train")
    bindings=dict(source_revision="cpu-test",data="fixture")
    migration=dict(parent_update=start,inherited_optimizer_parameters=parent["optimizer_parameter_names"],
                   new_parameters=names[len(parent["optimizer_parameter_names"]):])
    record=update_model(model,optimizer,reader,plan,start,torch.device("cpu"))
    assert all(torch.isfinite(torch.tensor(v)) for v in record["forecast_losses"].values())
    ema.update_ema(model,.999**4)
    path=tmp_path/"checkpoint.pt"
    orthogonal_checkpoint.save(path,model,ema,optimizer,optimizer_names=names,config=config,
        bindings=bindings,migration=migration,next_update=start+1,
        rank_states=[dict(plan=asdict(plan),next_update=start+1,random=capture_random_state())],metadata={})
    restored,remainder,opt,_,step=orthogonal_checkpoint.restore(torch.load(path,weights_only=False),
        config=config,bindings=bindings,plan=plan,device="cpu")
    update_model(model,optimizer,reader,plan,start+1,torch.device("cpu"))
    update_model(restored,opt,reader,plan,step,torch.device("cpu"))
    for name,value in model.state_dict().items():
        if torch.is_tensor(value): torch.testing.assert_close(restored.state_dict()[name],value,rtol=0,atol=0)
    deployed,_=load_field_checkpoint(path)
    for modality in ("dino","depth"):
        U=deployed.codecs[modality].effective_basis()
        torch.testing.assert_close(U.T@U,torch.eye(U.shape[1]),rtol=0,atol=2e-6)


def test_precision_partition_and_unclamped_mfu():
    from simple_vla.orthogonal_metrics import PrecisionFlopCounter, metrics
    a=torch.randn(4,5);b=torch.randn(5,6)
    with PrecisionFlopCounter() as counter:
        a@b
        a.bfloat16()@b.bfloat16()
    assert counter.by_precision==dict(bf16=240,fp32=240)
    assert sum(counter.by_precision.values())==counter.get_total_flops()
    common=dict(flops=480,peaks=100,seconds=1,samples=256,allocated=100,reserved=200)
    assert "train/mfu" not in metrics(**common,phase_step=0)
    result=metrics(**common,phase_step=20)
    assert result["train/mfu"]==4.8 and result["perf/mfu_out_of_range"]


def test_fresh_initialization_warmup_and_exact_recovery(tmp_path):
    from dataclasses import asdict
    from test_simple_vla import small_field_model, field_batch
    from simple_vla.orthogonal_train import update_model
    from util.compact_future_training import TrainingPlan, capture_random_state, learning_rate
    frozen=small_field_model("compact")
    policy={n:v.clone() for n,v in frozen.state_dict().items() if torch.is_tensor(v)}
    inherited=[n for n,_ in frozen.named_parameters()]
    model,ema,optimizer,names,start=orthogonal_checkpoint.initialize_fresh(frozen,"cpu")
    assert start==0 and not optimizer.state
    for name,value in policy.items():
        torch.testing.assert_close(model.state_dict()[name],value,rtol=0,atol=0)
    for name,value in model.state_dict().items():
        if torch.is_tensor(value): torch.testing.assert_close(ema.state_dict()[name],value,rtol=0,atol=0)
    assert learning_rate(0)==1e-4/375 and learning_rate(374)==learning_rate(375)==1e-4
    plan=TrainingPlan("compact",1,0,microbatch=2,compute_batch=128)
    config=dict(target_update=128000,reconstruction_weight=1,mode="train",initialization="fresh_E12_predictor_PCA")
    bindings=dict(source_revision="cpu-fresh",data="fixture")
    migration=dict(initialization=config["initialization"],parent_update=0,
                   inherited_optimizer_parameters=inherited,new_parameters=names[len(inherited):])
    def save(step):
        return orthogonal_checkpoint.save(tmp_path/f"step{step}.pt",model,ema,optimizer,
            optimizer_names=names,config=config,bindings=bindings,migration=migration,next_update=step,
            rank_states=[dict(plan=asdict(plan),next_update=step,random=capture_random_state())],metadata={})
    initial=save(0)
    orthogonal_checkpoint.restore(initial,config=config,bindings=bindings,plan=plan,device="cpu")
    class Reader:
        def draw(self,stream,size,*,random_key): return field_batch(size),[str(i) for i in range(size)]
    reader=Reader()
    optimizer.param_groups[0]["lr"]=learning_rate(0)
    update_model(model,optimizer,reader,plan,0,torch.device("cpu"))
    ema.update_ema(model,.999**4)
    payload=save(1)
    replay,replay_ema,replay_opt,_,step=orthogonal_checkpoint.restore(payload,
        config=config,bindings=bindings,plan=plan,device="cpu")
    for opt in (optimizer,replay_opt): opt.param_groups[0]["lr"]=learning_rate(1)
    update_model(model,optimizer,reader,plan,1,torch.device("cpu"))
    update_model(replay,replay_opt,reader,plan,step,torch.device("cpu"))
    for name,value in model.state_dict().items():
        if torch.is_tensor(value): torch.testing.assert_close(replay.state_dict()[name],value,rtol=0,atol=0)
    bad=copy.deepcopy(payload); bad["optimizer"]["param_groups"][0]["lr"]=1e-4
    with pytest.raises(ValueError): orthogonal_checkpoint.restore(bad,config=config,bindings=bindings,plan=plan,device="cpu")
