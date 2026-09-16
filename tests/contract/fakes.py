"""
Lightweight fake of the `genlayer` module surface used by
FailoverRegistry.py / FailoverGate.py, so contract logic can be exercised
in plain CPython for protocol-level testing.

A real GenVM is required for true end-to-end execution (nondeterministic
web fetch + LLM consensus across independent validator nodes). This fake
lets us test:
  - storage semantics (TreeMap, DynArray)
  - control flow / guards / exceptions
  - the leader/validator harness wiring (gl.vm.run_nondet_unsafe), by
    letting tests inject a scripted sequence of "independent fetch"
    results to simulate agreement / disagreement between nodes.

This is NOT a GenVM simulator and must not be treated as proof of live
Studionet behavior.
"""
import sys
import types
import json as _json
from datetime import datetime, timezone


class FakeAddress(str):
    """Addresses behave like strings for our purposes."""

    def __new__(cls, value="0x0000000000000000000000000000000000000000"):
        return str.__new__(cls, value)


class TreeMap(dict):
    def get(self, key, default=None):
        return dict.get(self, key, default)


class DynArray(list):
    pass


class u256(int):
    pass


class Return:
    """Mimics gl.vm.Return wrapper around a leader function's calldata."""

    def __init__(self, calldata):
        self.calldata = calldata


class _Clock:
    """Shared mutable deterministic-time source. The real GenVM MessageType
    has no numeric timestamp field at all (see genlayer.gl.MessageType) --
    only gl.message_raw['datetime'], an ISO-8601 string -- which is what
    FailoverRegistry._tx_time() actually parses. This fake keeps a single
    clock so `gl.message.timestamp += N` (used by tests to simulate the
    passage of time past a cooldown) and gl.message_raw['datetime'] always
    agree, rather than re-diverging from the real API surface again."""

    def __init__(self, ts):
        self._ts = ts

    def get(self):
        return self._ts

    def set(self, ts):
        self._ts = ts


class _Message:
    """Mirrors genlayer.gl.MessageType's real fields (contract_address,
    sender_address, origin_address, value, chain_id) plus a `timestamp`
    convenience property for tests -- backed by the shared clock, not a
    real MessageType attribute."""

    def __init__(self, sender_address, clock: _Clock):
        self.sender_address = FakeAddress(sender_address)
        self.origin_address = FakeAddress(sender_address)
        self.contract_address = FakeAddress()
        self.value = u256(0)
        self.chain_id = u256(61999)
        self._clock = clock

    @property
    def timestamp(self):
        return self._clock.get()

    @timestamp.setter
    def timestamp(self, value):
        self._clock.set(value)


class _MessageRaw(dict):
    """Mirrors genlayer._internal.msg.MessageRawType -- in particular the
    `datetime` ISO-8601 string field FailoverRegistry._tx_time() actually
    reads, derived live from the same shared clock as gl.message.timestamp."""

    def __init__(self, sender_address, clock: _Clock):
        super().__init__(
            contract_address=FakeAddress(),
            sender_address=FakeAddress(sender_address),
            origin_address=FakeAddress(sender_address),
            stack=[],
            value=0,
            is_init=False,
            chain_id=61999,
        )
        self._clock = clock

    def __getitem__(self, key):
        if key == "datetime":
            return datetime.fromtimestamp(self._clock.get(), tz=timezone.utc).isoformat()
        return super().__getitem__(key)


class _WebFetchQueue:
    """Test harness: a queue of dicts keyed by url returning content or
    raising to simulate UNAVAILABLE. Supports per-call sequencing so a
    leader call and a validator call can be scripted independently."""

    def __init__(self):
        self._responses_by_call = []  # list of {url: content_or_Exception}
        self._call_index = -1

    def push_round(self, mapping):
        self._responses_by_call.append(mapping)

    def _current_round(self):
        return self._responses_by_call[min(self._call_index, len(self._responses_by_call) - 1)]

    def get(self, url):
        round_map = self._current_round()
        val = round_map.get(url, "")
        if isinstance(val, Exception):
            raise val
        return val

    def begin_call(self):
        self._call_index += 1


class _NondetWeb:
    def __init__(self, queue: _WebFetchQueue):
        self._queue = queue

    def get(self, url):
        return self._queue.get(url)

    def render(self, url):
        return self._queue.get(url)


class _PromptQueue:
    """Queue of scripted model outputs (dicts), consumed in order, one per
    independent evaluator (leader, validator1, validator2, ...)."""

    def __init__(self):
        self._outputs = []
        self._i = -1

    def push(self, output):
        self._outputs.append(output)

    def next(self, prompt, response_format=None):
        self._i += 1
        if self._i >= len(self._outputs):
            # repeat the last scripted output if the test under-provisioned
            return self._outputs[-1]
        return self._outputs[self._i]


class _Nondet:
    def __init__(self, web_queue: _WebFetchQueue, prompt_queue: _PromptQueue):
        self.web = _NondetWeb(web_queue)
        self._prompt_queue = prompt_queue

    def exec_prompt(self, prompt, response_format=None):
        return self._prompt_queue.next(prompt, response_format)


class _VM:
    Return = Return

    def __init__(self):
        self.n_validators = 2
        self._force_disagree = False

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        """Simplified single-process simulation: run leader once, wrap in
        Return, run N validators; require ALL validators to approve
        (majority-of-honest-nodes semantics collapse to unanimity for a
        deterministic small-N test harness). Returns the leader's candidate
        if consensus is reached, else None (abstain)."""
        self._web_queue.begin_call()
        leader_result = leader_fn()
        wrapped = Return(leader_result)
        approvals = 0
        for _ in range(self.n_validators):
            self._web_queue.begin_call()
            if validator_fn(wrapped):
                approvals += 1
        if approvals == self.n_validators:
            return leader_result
        return None


def make_fake_genlayer_module(sender_address="0xOWNER", timestamp=1_700_000_000):
    """Builds and registers a fake `genlayer` module in sys.modules so that
    `from genlayer import *` inside the contract files resolves to this
    fake for protocol tests. Returns (module, gl_namespace_dict, web_queue,
    prompt_queue) so tests can script fetch/model behavior and advance
    timestamps between calls."""
    web_queue = _WebFetchQueue()
    prompt_queue = _PromptQueue()
    vm = _VM()
    vm._web_queue = web_queue
    clock = _Clock(timestamp)
    message = _Message(sender_address, clock)
    message_raw = _MessageRaw(sender_address, clock)
    nondet = _Nondet(web_queue, prompt_queue)

    class _GlNamespace(types.SimpleNamespace):
        pass

    gl = _GlNamespace()
    gl.vm = vm
    gl.message = message
    gl.message_raw = message_raw
    gl.nondet = nondet

    def public_view(fn):
        fn._gl_view = True
        return fn

    def public_write(fn):
        fn._gl_write = True
        return fn

    gl.public = types.SimpleNamespace(view=public_view, write=public_write)

    def contract_interface(cls):
        return cls

    gl.contract_interface = contract_interface

    import typing

    def _default_for_annotation(ann):
        origin = typing.get_origin(ann) or ann
        if origin is TreeMap:
            return TreeMap()
        if origin is DynArray:
            return DynArray()
        if origin is u256:
            return u256(0)
        if origin is FakeAddress:
            return FakeAddress()
        if origin is str:
            return ""
        if origin is int:
            return 0
        if origin is bool:
            return False
        if origin is dict:
            return {}
        if origin is list:
            return []
        return None

    class Contract:
        def __new__(cls, *args, **kwargs):
            obj = object.__new__(cls)
            annotations = {}
            for klass in reversed(cls.__mro__):
                annotations.update(getattr(klass, "__annotations__", {}))
            for field_name, ann in annotations.items():
                object.__setattr__(obj, field_name, _default_for_annotation(ann))
            return obj

    gl.Contract = Contract
    gl.Event = lambda *a, **k: None

    module = types.ModuleType("genlayer")
    module.gl = gl
    module.TreeMap = TreeMap
    module.DynArray = DynArray
    module.u256 = u256
    module.Address = FakeAddress

    def _star_export():
        return {
            "gl": gl,
            "TreeMap": TreeMap,
            "DynArray": DynArray,
            "u256": u256,
            "Address": FakeAddress,
        }

    module.__dict__.update(_star_export())
    module.__all__ = list(_star_export().keys())

    sys.modules["genlayer"] = module
    return module, gl, web_queue, prompt_queue


def reset_genlayer_fake():
    if "genlayer" in sys.modules:
        del sys.modules["genlayer"]
    for mod_name in ("FailoverRegistry", "FailoverGate"):
        if mod_name in sys.modules:
            del sys.modules[mod_name]
