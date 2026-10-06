import bpy

obj = bpy.data.objects.get("input_mesh")
mirror = obj.modifiers.get("Mirror")
if mirror:
    print("Mirror use_axis:", mirror.use_axis[:])
