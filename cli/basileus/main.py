from basileus.async_typer import AsyncTyper
from basileus.commands.deploy import deploy_command
from basileus.commands.register import register_command
from basileus.commands.stop import stop_command

app = AsyncTyper(
    help="Basileus — Deploy autonomous prediction market agents on Base",
    no_args_is_help=True,
)

app.command(name="deploy")(deploy_command)
app.command(name="register")(register_command)
app.command(name="stop")(stop_command)
