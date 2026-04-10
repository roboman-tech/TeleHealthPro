from pydantic import BaseModel

from app.models.user import ProviderReadiness


class UserAdminUpdate(BaseModel):
    is_active: bool | None = None
    is_provider_approved: bool | None = None
    provider_readiness: ProviderReadiness | None = None
