//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ***********************************************
// ▗▖  ▗▖ ▗▄▖ ▗▖  ▗▖▗▄▄▄▖ ▗▄▄▖▗▄▄▄▖▗▄▖ ▗▖  ▗▖▗▄▄▄▖
// ▐▛▚▖▐▌▐▌ ▐▌▐▛▚▞▜▌▐▌   ▐▌     █ ▐▌ ▐▌▐▛▚▖▐▌▐▌
// ▐▌ ▝▜▌▐▛▀▜▌▐▌  ▐▌▐▛▀▀▘ ▝▀▚▖  █ ▐▌ ▐▌▐▌ ▝▜▌▐▛▀▀▘
// ▐▌  ▐▌▐▌ ▐▌▐▌  ▐▌▐▙▄▄▖▗▄▄▞▘  █ ▝▚▄▞▘▐▌  ▐▌▐▙▄▄▖
// ***********************************************

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IMulticallable {
    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results);

    function multicallWithNodeCheck(
        bytes32,
        bytes[] calldata data
    ) external returns (bytes[] memory results);
}

interface IABIResolver {
    event ABIChanged(bytes32 indexed node, uint256 indexed contentType);

    /// Returns the ABI associated with an ENS node.
    /// Defined in EIP205.
    /// @param node The ENS node to query
    /// @param contentTypes A bitwise OR of the ABI formats accepted by the caller.
    /// @return contentType The content type of the return value
    /// @return data The ABI data
    function ABI(
        bytes32 node,
        uint256 contentTypes
    ) external view returns (uint256, bytes memory);
}

/// Interface for the new (multicoin) addr function.
interface IAddressResolver {
    event AddressChanged(
        bytes32 indexed node,
        uint256 coinType,
        bytes newAddress
    );

    function addr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bytes memory);
}

/// Interface for the legacy (ETH-only) addr function.
interface IAddrResolver {
    event AddrChanged(bytes32 indexed node, address a);

    /// Returns the address associated with an ENS node.
    /// @param node The ENS node to query.
    /// @return The associated address.
    function addr(bytes32 node) external view returns (address payable);
}

interface IContentHashResolver {
    event ContenthashChanged(bytes32 indexed node, bytes hash);

    /// Returns the contenthash associated with an ENS node.
    /// @param node The ENS node to query.
    /// @return The associated contenthash.
    function contenthash(bytes32 node) external view returns (bytes memory);
}

interface ITextResolver {
    event TextChanged(
        bytes32 indexed node,
        string indexed indexedKey,
        string key,
        string value
    );

    /// Returns the text data associated with an ENS node and key.
    /// @param node The ENS node to query.
    /// @param key The text data key to query.
    /// @return The associated text data.
    function text(
        bytes32 node,
        string calldata key
    ) external view returns (string memory);
}

interface IExtendedResolver {
    function resolve(
        bytes memory name,
        bytes memory data
    ) external view returns (bytes memory);
}

/// @author NameStone
interface IL2Resolver is
    IERC165,
    IMulticallable,
    IABIResolver,
    IAddressResolver,
    IAddrResolver,
    IContentHashResolver,
    ITextResolver,
    IExtendedResolver
{
    error Unauthorized(bytes32 node);

    function setABI(
        bytes32 node,
        uint256 contentType,
        bytes calldata data
    ) external;

    function setAddr(bytes32 node, address addr) external;

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external;

    function setContenthash(bytes32 node, bytes calldata hash) external;

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external;
}
