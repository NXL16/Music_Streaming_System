import ast
import tempfile
import unittest
from pathlib import Path


SOURCE_FILE = Path(__file__).with_name("stem_separation_modal.py")


def load_configure_output_dir():
    tree = ast.parse(SOURCE_FILE.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "configure_output_dir"
    )
    module = ast.Module(body=[function], type_ignores=[])
    namespace = {"Path": Path}
    exec(compile(ast.fix_missing_locations(module), str(SOURCE_FILE), "exec"), namespace)
    return namespace["configure_output_dir"]


configure_output_dir = load_configure_output_dir()


class Model:
    output_dir = "stale-output"


class Separator:
    def __init__(self) -> None:
        self.output_dir = "stale-output"
        self.model_instance = Model()


class ConfigureOutputDirTests(unittest.TestCase):
    def test_updates_the_warm_model_and_wrapper(self) -> None:
        separator = Separator()
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp) / "request-output"

            configure_output_dir(separator, output_dir)

            self.assertTrue(output_dir.is_dir())
            self.assertEqual(separator.output_dir, str(output_dir))
            self.assertEqual(separator.model_instance.output_dir, str(output_dir))

    def test_rejects_an_uninitialized_model(self) -> None:
        separator = Separator()
        separator.model_instance = None

        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError, "not initialized"):
                configure_output_dir(separator, Path(temp))


if __name__ == "__main__":
    unittest.main()
