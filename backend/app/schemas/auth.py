from pydantic import BaseModel, EmailStr, Field

from app.models.user import ProviderReadiness, UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str
    role: UserRole = UserRole.patient

    # Required for patient sign-up (stored in patient_records.demographics at registration time)
    date_of_birth: str | None = None  # ISO date (YYYY-MM-DD)
    pronouns: str | None = None
    note: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    is_provider_approved: bool
    provider_readiness: ProviderReadiness | None = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
