"""Sphinx configuration for birdcurve-dashboard docs."""
from __future__ import annotations

import os
import sys
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent
REPO_ROOT = DOCS_DIR.parent.parent
BACKEND_SRC = REPO_ROOT / "dashboard" / "backend"

sys.path.insert(0, str(BACKEND_SRC))

project = "birdcurve-dashboard"
author = "Mayk Thewessen"
copyright = "2026, Mayk Thewessen"
release = os.environ.get("DOCS_RELEASE", "main")

extensions = [
    "myst_parser",
    "autoapi.extension",
    "sphinx.ext.napoleon",
    "sphinx.ext.viewcode",
    "sphinx.ext.intersphinx",
    "sphinx_copybutton",
    "sphinx_design",
]

myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "linkify",
    "substitution",
    "tasklist",
]
myst_heading_anchors = 3

# sphinx-autoapi: parses source statically — no need to import (avoids DuckDB side-effects)
autoapi_type = "python"
autoapi_dirs = [str(BACKEND_SRC / "app")]
autoapi_root = "api"
autoapi_keep_files = False
autoapi_add_toctree_entry = True
autoapi_options = [
    "members",
    "undoc-members",
    "show-inheritance",
    "show-module-summary",
    "imported-members",
]
autoapi_python_class_content = "both"
autoapi_member_order = "groupwise"

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "fastapi": ("https://fastapi.tiangolo.com/", None),
    "pandas": ("https://pandas.pydata.org/docs/", None),
    "numpy": ("https://numpy.org/doc/stable/", None),
}

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
source_suffix = {".md": "markdown", ".rst": "restructuredtext"}

html_theme = "furo"
html_static_path = ["_static"]
html_title = f"birdcurve-dashboard <span class=\"release\">{release}</span>"
html_theme_options = {
    "source_repository": "https://github.com/MaykThewessen/birdcurve-dashboard/",
    "source_branch": "main",
    "source_directory": "docs/sphinx/",
    "navigation_with_keys": True,
    "sidebar_hide_name": False,
}

# autoapi pulls in third-party base classes (pydantic, starlette) we don't
# intersphinx-map → silence the resulting unresolved-ref noise instead of -W-failing.
nitpicky = False
suppress_warnings = [
    "myst.header",
    "myst.xref_missing",
    "ref.class",
    "ref.obj",
]
