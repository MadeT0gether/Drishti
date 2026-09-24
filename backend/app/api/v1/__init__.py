from fastapi import APIRouter

from app.api.v1 import audit, citizen_reports, copilot, dashboard, data, geotag, investigations, misc, projects
from app.api import auth as auth_module

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(auth_module.router)          # /api/v1/auth/*
v1_router.include_router(projects.router)
v1_router.include_router(dashboard.router)
v1_router.include_router(misc.alerts_router)
v1_router.include_router(misc.models_router)
v1_router.include_router(investigations.router)
v1_router.include_router(copilot.router)
v1_router.include_router(copilot.status_router)
v1_router.include_router(audit.router)
v1_router.include_router(data.router)
v1_router.include_router(geotag.router)               # /api/v1/geotag/*
v1_router.include_router(citizen_reports.router)      # /api/v1/citizen-reports/*
