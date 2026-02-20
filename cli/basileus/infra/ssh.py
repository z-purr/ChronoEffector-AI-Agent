import os
import tempfile
import time
import zipfile
from pathlib import Path

import paramiko
from pathspec import PathSpec

from basileus.infra.scripts import (
    CONFIGURE_SERVICE_SCRIPT,
    DEPLOY_CODE_SCRIPT,
    INSTALL_DEPS_SCRIPT,
    INSTALL_NODE_SCRIPT,
)

AGENT_ZIP_BLACKLIST = [".git", ".idea", ".vscode"]
AGENT_ZIP_WHITELIST = [".env", ".env.prod"]


def _resolve_private_key(ssh_pubkey_path: Path) -> str:
    """Derive private key path by stripping .pub suffix."""
    pub = str(ssh_pubkey_path)
    if pub.endswith(".pub"):
        return pub[:-4]
    return pub


def _auto_detect_ssh_key() -> str:
    """Auto-detect SSH private key from ~/.ssh/."""
    ssh_dir = Path.home() / ".ssh"
    for name in ["id_ed25519", "id_rsa", "id_ecdsa"]:
        path = ssh_dir / name
        if path.exists():
            return str(path)
    raise FileNotFoundError("No SSH private key found in ~/.ssh/")


def _run_script(client: paramiko.SSHClient, script: str, label: str) -> None:
    """Upload a script to /tmp and execute it. Raises on non-zero exit."""
    sftp = client.open_sftp()
    remote_path = f"/tmp/basileus-{label}.sh"
    with sftp.file(remote_path, "w") as f:
        f.write(script)
    sftp.close()

    _stdin, stdout, stderr = client.exec_command(f"bash {remote_path}")
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        err = stderr.read().decode()
        raise RuntimeError(f"{label} failed (exit {exit_status}):\n{err}")


def wait_for_ssh(
    host: str, ssh_pubkey_path: Path | None = None, timeout: int = 300
) -> paramiko.SSHClient:
    """Retry SSH connection until success or timeout. Returns connected client."""
    import logging

    # Suppress paramiko transport errors during retry loop
    logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

    if ssh_pubkey_path is not None:
        key_path = _resolve_private_key(ssh_pubkey_path)
    else:
        key_path = _auto_detect_ssh_key()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    deadline = time.time() + timeout
    last_error: Exception | None = None

    while time.time() < deadline:
        try:
            client.connect(hostname=host, username="root", key_filename=key_path)
            logging.getLogger("paramiko.transport").setLevel(logging.WARNING)
            return client
        except Exception as e:
            last_error = e
            time.sleep(10)

    logging.getLogger("paramiko.transport").setLevel(logging.WARNING)
    raise TimeoutError(
        f"SSH connection to {host} timed out after {timeout}s: {last_error}"
    )


def upload_agent(client: paramiko.SSHClient, agent_path: Path) -> None:
    """Zip agent directory (respecting .gitignore) and upload via SFTP."""
    gitignore_path = agent_path / ".gitignore"
    if gitignore_path.exists():
        patterns = gitignore_path.read_text().splitlines()
    else:
        patterns = []

    spec = PathSpec.from_lines("gitwildmatch", patterns + AGENT_ZIP_BLACKLIST)

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(agent_path):
                for fname in files:
                    full = os.path.join(root, fname)
                    rel = os.path.relpath(full, agent_path)
                    if not spec.match_file(rel) or rel in AGENT_ZIP_WHITELIST:
                        zf.write(full, arcname=rel)

        sftp = client.open_sftp()
        sftp.put(tmp_path, "/tmp/basileus-agent.zip")
        sftp.close()
    finally:
        os.unlink(tmp_path)


def install_node(client: paramiko.SSHClient) -> None:
    """Install Node.js 22 and tsx on the remote host."""
    _run_script(client, INSTALL_NODE_SCRIPT, "install-node")


def deploy_code(client: paramiko.SSHClient) -> None:
    """Unzip uploaded agent code to /opt/basileus."""
    _run_script(client, DEPLOY_CODE_SCRIPT, "deploy-code")


def install_deps(client: paramiko.SSHClient) -> None:
    """Run npm install in /opt/basileus."""
    _run_script(client, INSTALL_DEPS_SCRIPT, "install-deps")


def configure_service(client: paramiko.SSHClient) -> None:
    """Write systemd unit, enable and start the service."""
    _run_script(client, CONFIGURE_SERVICE_SCRIPT, "configure-service")


def verify_service(client: paramiko.SSHClient) -> bool:
    """Check if basileus-agent systemd service is active."""
    _stdin, stdout, _stderr = client.exec_command("systemctl is-active basileus-agent")
    stdout.channel.recv_exit_status()
    return stdout.read().strip() == b"active"
