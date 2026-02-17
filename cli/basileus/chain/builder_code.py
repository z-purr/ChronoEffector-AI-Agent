_ERC_SUFFIX = bytes.fromhex("80218021802180218021802180218021")


def builder_code_suffix(code: str) -> bytes:
    """ERC-8021 Schema 0: codes_ascii ∥ codesLength (1 byte) ∥ 0x00 ∥ ercSuffix (16 bytes)"""
    codes_bytes = code.encode("ascii")
    return (
        codes_bytes
        + len(codes_bytes).to_bytes(1, "big")
        + b"\x00"
        + _ERC_SUFFIX
    )
