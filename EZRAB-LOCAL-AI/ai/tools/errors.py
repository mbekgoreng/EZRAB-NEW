class ToolError(Exception): pass
class DuplicateToolError(ToolError): pass
class ToolNotFoundError(ToolError): pass
class ToolInputError(ToolError): pass
class ToolSafetyError(ToolError): pass
