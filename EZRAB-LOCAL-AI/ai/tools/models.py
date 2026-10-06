from pydantic import BaseModel, Field
class ProjectIdArguments(BaseModel): project_id: str = Field(min_length=1, max_length=128)
class RabSearchArguments(ProjectIdArguments):
    query: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=10, ge=1, le=30)
class RabCalculationArguments(ProjectIdArguments):
    query: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=200)
