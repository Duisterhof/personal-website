"""E12 compact native objective with a learned tied orthonormal basis."""
import copy

import torch
from torch import nn

from simple_vla.joint_codec import flow_loss
from simple_vla.checkpoint import cpu_state
from util.compact_future_codec import FrozenChannelCodec
from util.modality_forcing.compact_future_format import load_model_checkpoint


MODEL_FORMAT = "e12_orthogonal_codec_model_v1"


class OrthogonalChannelCodec(FrozenChannelCodec):
    """One learned thin factor; positive-diagonal QR gives a tied Stiefel basis.

    Native dimensions are reduced, so only encode(decode(z)) is identity.
    Means/scales/packing remain the original E12 buffers. EMA averages the
    factor and is QR-normalized too; averaging effective bases is not assumed
    to preserve orthogonality. QR is deliberately FP32 outside autocast.
    """
    def __init__(self, frozen):
        super().__init__(frozen.projection.mean.T, frozen.projection.basis,
                         grid=frozen.packing.grid, tile=frozen.packing.tile)
        self.projection.register_parameter(
            "learned_basis", nn.Parameter(self.projection.basis.clone()))

    def effective_basis(self):
        factor = self.projection.learned_basis
        with torch.autocast(device_type=factor.device.type, enabled=False):
            q, r = torch.linalg.qr(factor.float(), mode="reduced")
            diagonal = torch.diagonal(r)
            # Rank deficiency invalidates differentiable QR; fail rather than
            # silently inventing an encoder direction.
            if not bool(torch.isfinite(diagonal).all()) or bool((diagonal.abs() < 1e-7).any()):
                raise FloatingPointError("Learned basis factor is nonfinite or rank deficient")
            sign = torch.where(diagonal < 0, -torch.ones_like(diagonal), torch.ones_like(diagonal))
            return q * sign.unsqueeze(0)

    def encode(self, field):
        self.projection._check_precision()
        if field.shape[-2:] != (self.packing.grid[0] * self.packing.grid[1], self.native_channels):
            raise ValueError("Native field differs from saved codec")
        with torch.autocast(device_type=field.device.type, enabled=False):
            centered = field.float().transpose(-2, -1) - self.projection.mean
            code = torch.einsum("pk,...pc->...kc", self.effective_basis(), centered)
            code = code / self.projection.coefficient_scale
        return self.packing.pack(code.transpose(-2, -1))

    def decode(self, tokens):
        self.projection._check_precision()
        code = self.packing.unpack(tokens).transpose(-2, -1)
        with torch.autocast(device_type=code.device.type, enabled=False):
            field = self.projection.mean + torch.einsum(
                "pk,...kc->...pc", self.effective_basis(), code.float() * self.projection.coefficient_scale)
        return field.transpose(-2, -1)

    def error_decomposition(self, predicted_tokens, target_field):
        raise ValueError("Projection changes during training; report native losses")


def enable_orthogonal_codecs(model):
    if model.arm != "compact":
        raise ValueError("Only the existing compact model can learn its channel maps")
    for name in ("dino", "depth"):
        if type(model.codecs[name]) is not FrozenChannelCodec:
            raise ValueError("Joint migration requires the original frozen channel codec")
        model.codecs[name] = OrthogonalChannelCodec(model.codecs[name])
    return model


def model_snapshot(model, bindings):
    return dict(format=MODEL_FORMAT, spec=copy.deepcopy(model.get_extra_state()),
                bindings=copy.deepcopy(bindings), state_dict=cpu_state(model.state_dict()))


def load_snapshot(snapshot):
    """Rebuild the original tensor layout, then restore its learned maps."""
    if (snapshot.get("format") != MODEL_FORMAT or snapshot["spec"]["arm"] != "compact"
            or snapshot["state_dict"]["_extra_state"] != snapshot["spec"]):
        raise ValueError("Invalid joint compact checkpoint")
    frozen = copy.deepcopy(snapshot)
    frozen["format"] = "e12_compact_future_checkpoint_v1"
    for name in ("dino", "depth"):
        layout = frozen["spec"]["codecs"][name]
        if layout["kind"] != "OrthogonalChannelCodec":
            raise ValueError("Both visual maps must use the joint checkpoint format")
        layout["kind"] = "FrozenChannelCodec"
        # Codec state keeps tuple geometry; the model spec stores JSON lists.
        frozen["state_dict"][f"codecs.{name}._extra_state"]["kind"] = "FrozenChannelCodec"
        for mapping in ("learned_basis",):
            del frozen["state_dict"][f"codecs.{name}.projection.{mapping}"]
    frozen["state_dict"]["_extra_state"] = copy.deepcopy(frozen["spec"])
    model = load_model_checkpoint(frozen, expected_bindings=snapshot["bindings"])
    enable_orthogonal_codecs(model)
    model.load_state_dict(snapshot["state_dict"], strict=True)
    return model
