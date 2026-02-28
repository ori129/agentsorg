from fastapi import APIRouter
from pydantic import BaseModel

from app.services.demo_state import SIZE_MAP, get_demo_state, set_demo_state

router = APIRouter(tags=["demo"])


class DemoStateRead(BaseModel):
    enabled: bool
    size: str
    gpt_count: int


class DemoStateUpdate(BaseModel):
    enabled: bool
    size: str = "medium"


@router.get("/demo", response_model=DemoStateRead)
async def get_demo():
    state = get_demo_state()
    return DemoStateRead(
        enabled=state["enabled"],
        size=state["size"],
        gpt_count=SIZE_MAP[state["size"]],
    )


@router.put("/demo", response_model=DemoStateRead)
async def update_demo(body: DemoStateUpdate):
    state = set_demo_state(body.enabled, body.size)
    return DemoStateRead(
        enabled=state["enabled"],
        size=state["size"],
        gpt_count=SIZE_MAP[state["size"]],
    )
