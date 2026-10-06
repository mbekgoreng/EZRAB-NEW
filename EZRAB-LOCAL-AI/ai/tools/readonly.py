from ai.tools.executor import unavailable
from ai.tools.models import ProjectIdArguments, RabCalculationArguments, RabSearchArguments
from ai.tools.registry import ToolDefinition

def _result(name, context, data=None, items=None, limitations=None):
    return {"success": True, "tool_name": name, "availability": "available", "data": data or {}, "items": items or [], "source": context.source, "limitations": limitations or ["Context browser bersifat prototype local development."], "request_id": context.request_id}
def _rab(context): return context.project_context.get("rab", {})
async def project(args, context):
    data=context.project_context.get("project", {})
    return _result("get_project_summary", context, data) if data.get("available") else unavailable("get_project_summary",context.request_id,context.source,"Data proyek aktif belum tersedia.")
async def rab_summary(args, context):
    rab=_rab(context)
    if not rab.get("available"): return unavailable("get_rab_summary",context.request_id,context.source,"Data RAB belum tersedia pada konteks proyek saat ini.")
    cats=sorted({i.get("category") for i in rab.get("items",[]) if i.get("category")})
    return _result("get_rab_summary",context,{"context_total":rab.get("total"),"backend_official_total":None,"item_count":rab.get("item_count"),"categories_in_context":cats},limitations=["Total berasal dari context frontend, bukan total resmi backend."])
async def rab_search(args, context):
    rab=_rab(context)
    if not rab.get("available"): return unavailable("search_rab_items",context.request_id,context.source,"Data RAB belum tersedia pada konteks proyek saat ini.")
    q=args.query.lower(); matches=[i for i in rab.get("items",[]) if q in " ".join(str(i.get(k,"")) for k in ("code","category","description")).lower()][:args.limit]
    return _result("search_rab_items",context,{"result_count":len(matches)},matches,["Pencarian terbatas pada slice RAB yang dikirim frontend."])
async def rab_calculate(args, context):
    rab=_rab(context)
    if not rab.get("available"): return unavailable("calculate_rab_summary",context.request_id,context.source,"Data RAB belum tersedia pada konteks proyek saat ini.")
    items=rab.get("items",[])
    if args.query:
        q=args.query.lower(); items=[i for i in items if q in " ".join(str(i.get(k,"")) for k in ("code","category","description")).lower()]
    if args.category: items=[i for i in items if args.category.lower() in str(i.get("category","")).lower()]
    total=sum(i.get("totalPrice") if isinstance(i.get("totalPrice"),(int,float)) else i.get("amount",0) for i in items)
    return _result("calculate_rab_summary",context,{"calculated_total_from_received_items":total,"context_total":rab.get("total"),"backend_official_total":None,"included_item_count":len(items)},limitations=["Perhitungan hanya dari item RAB yang tersedia pada context request."])
async def progress(args, context):
    project=context.project_context.get("project",{}); value=project.get("progress")
    return _result("get_project_progress",context,{"progress":value}) if isinstance(value,(int,float)) else unavailable("get_project_progress",context.request_id,context.source,"Data progres belum tersedia pada konteks proyek saat ini.")
async def schedule(args, context):
    data=context.project_context.get("schedule",{})
    return _result("get_project_schedule",context,{"item_count":len(data.get("items",[]))},data.get("items",[])) if data.get("available") else unavailable("get_project_schedule",context.request_id,context.source,"Data jadwal belum tersedia pada konteks proyek saat ini.")
async def ahsp(args, context): return unavailable("search_ahsp",context.request_id,context.source,"Sumber data AHSP belum terhubung.")
async def qto(args, context):
    data=context.project_context.get("qto",{})
    return _result("get_qto_summary",context,{"item_count":len(data.get("items",[]))},data.get("items",[])) if data.get("available") else unavailable("get_qto_summary",context.request_id,context.source,"Data QTO belum tersedia pada konteks proyek saat ini.")
async def report(args, context): return unavailable("get_report_summary",context.request_id,context.source,"Sumber data laporan belum terhubung.")
def register_read_only_tools(registry):
    for tool in [
        ToolDefinition("get_project_summary","Membaca ringkasan proyek EZRAB.","project",ProjectIdArguments,project),
        ToolDefinition("get_rab_summary","Membaca ringkasan RAB proyek.","rab",ProjectIdArguments,rab_summary),
        ToolDefinition("search_rab_items","Mencari item RAB pada context aktif.","rab",RabSearchArguments,rab_search),
        ToolDefinition("calculate_rab_summary","Menghitung item RAB yang diterima.","rab",RabCalculationArguments,rab_calculate),
        ToolDefinition("get_project_progress","Membaca progres proyek.","schedule",ProjectIdArguments,progress),
        ToolDefinition("get_project_schedule","Membaca jadwal proyek.","schedule",ProjectIdArguments,schedule),
        ToolDefinition("search_ahsp","Mencari AHSP jika sumber resmi terhubung.","ahsp",RabSearchArguments,ahsp,availability="not_connected"),
        ToolDefinition("get_qto_summary","Membaca QTO jika tersedia.","qto",ProjectIdArguments,qto),
        ToolDefinition("get_report_summary","Membaca laporan jika sumber terhubung.","report",ProjectIdArguments,report,availability="not_connected"),
    ]: registry.register(tool)
