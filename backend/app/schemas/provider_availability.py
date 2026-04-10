from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProviderAvailabilityCreate(BaseModel):
    start_at: datetime
    end_at: datetime = Field(..., description="Must be after start_at")


class ProviderAvailabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_id: int
    start_at: datetime
    end_at: datetime
    created_at: datetime
