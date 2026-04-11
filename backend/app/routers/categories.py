from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_system_admin
from app.database import get_db
from app.models.models import Category, WorkspaceUser
from app.schemas.schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(tags=["categories"])

DEFAULT_CATEGORIES = [
    {
        "name": "Writing & Content",
        "description": "Content creation, copywriting, editing",
        "color": "#3B82F6",
    },
    {
        "name": "Data & Analytics",
        "description": "Data analysis, reporting, visualization",
        "color": "#10B981",
    },
    {
        "name": "Engineering",
        "description": "Software development, DevOps, architecture",
        "color": "#6366F1",
    },
    {
        "name": "Sales & Marketing",
        "description": "Lead gen, campaigns, sales enablement",
        "color": "#F59E0B",
    },
    {
        "name": "HR & People",
        "description": "Recruiting, onboarding, employee experience",
        "color": "#EC4899",
    },
    {
        "name": "Legal & Compliance",
        "description": "Contract review, policy, regulatory",
        "color": "#8B5CF6",
    },
    {
        "name": "Finance",
        "description": "Budgeting, forecasting, accounting",
        "color": "#14B8A6",
    },
    {
        "name": "Customer Support",
        "description": "Ticketing, knowledge base, chatbots",
        "color": "#F97316",
    },
    {
        "name": "Product & Design",
        "description": "Product management, UX research, design",
        "color": "#06B6D4",
    },
    {
        "name": "Operations",
        "description": "Process automation, supply chain, logistics",
        "color": "#84CC16",
    },
    {
        "name": "Research",
        "description": "Market research, competitive intelligence",
        "color": "#A855F7",
    },
    {
        "name": "Other",
        "description": "Uncategorized or multi-purpose GPTs",
        "color": "#6B7280",
    },
]


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category).order_by(Category.sort_order, Category.id)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_category(
    data: CategoryCreate,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    cat = Category(**data.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cat, key, value)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await db.commit()


@router.post("/categories/seed", response_model=list[CategoryRead])
async def seed_categories(
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    for i, cat_data in enumerate(DEFAULT_CATEGORIES):
        existing = await db.execute(
            select(Category).where(Category.name == cat_data["name"])
        )
        if not existing.scalar_one_or_none():
            db.add(Category(**cat_data, sort_order=i))
    await db.commit()
    result = await db.execute(
        select(Category).order_by(Category.sort_order, Category.id)
    )
    return result.scalars().all()
