from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


def _find_project_root() -> Path:
    """Locate the BirdCurve_NL project root regardless of git worktree nesting.

    The backend lives at <somewhere>/dashboard/backend/app/config.py.
    When running from a git worktree at <project>/.worktrees/<branch>/,
    the actual data and model_results directories are in the main worktree
    (<project>/).  We detect this by checking whether any ancestor contains
    a `.worktrees` component and, if so, return the parent of that ancestor.
    Falls back to walking up to find the directory containing `data/birdcurve.db`.
    """
    here = Path(__file__).resolve()

    # Walk upward looking for <root>/.worktrees/<branch>/... pattern
    for parent in here.parents:
        if parent.name == ".worktrees":
            return parent.parent

    # Fallback: walk up to find the directory with data/birdcurve.db
    for parent in here.parents:
        if (parent / "data" / "birdcurve.db").exists():
            return parent

    # Last resort: 3 levels up from app/ gives the dashboard worktree root
    return here.parents[3]


PROJECT_ROOT = _find_project_root()


class Settings(BaseSettings):
    project_root: Path = PROJECT_ROOT
    sqlite_db: Path = PROJECT_ROOT / "data" / "birdcurve.db"
    model_results_dir: Path = PROJECT_ROOT / "model_results"
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:5173"]
    default_max_points_hourly: int = 5000
    default_max_points_15min: int = 10000


@lru_cache
def get_settings() -> Settings:
    return Settings()
