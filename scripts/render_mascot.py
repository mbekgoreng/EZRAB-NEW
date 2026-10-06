import bpy
import math

# Set up camera and light for a quick test render to view the mascot
cam = bpy.data.objects.get("Camera")
if not cam:
    cam_data = bpy.data.cameras.new(name="Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.scene.collection.objects.link(cam)

cam.location = (1.5, -2.5, 1.2)
cam.rotation_euler = (math.radians(65), 0, math.radians(30))
bpy.context.scene.camera = cam

# Set rendering engine to Workbench or EEVEE
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.filepath = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\scripts\mascot_render_test.png"

# Ensure lighting
light = bpy.data.objects.get("Light")
if light:
    light.location = (2.0, -2.0, 3.0)
    light.data.energy = 1000

bpy.ops.render.render(write_still=True)
print("Rendered to scripts/mascot_render_test.png")
