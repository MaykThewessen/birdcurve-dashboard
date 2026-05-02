import pytest
from app.config import get_settings

@pytest.fixture
def settings():
    return get_settings()
