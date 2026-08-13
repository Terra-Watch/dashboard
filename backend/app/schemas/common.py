from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class Location(BaseModel):
    latitude: Decimal = Field(max_digits=9, decimal_places=6)
    longitude: Decimal = Field(max_digits=9, decimal_places=6)


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


Timestamp = datetime

