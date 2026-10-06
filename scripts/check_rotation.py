import bpy
import math

obj = bpy.data.objects.get("input_mesh")
print("Obj rotation:", obj.rotation_euler)
print("Obj dimensions:", obj.dimensions)
# In Blender, dimensions are: X=1.737, Y=1.663, Z=0.866
# X is width (1.737), Y is height (1.663), Z is depth (0.866)!
# If we rotate obj by 90 degrees around X in Blender:
# (math.radians(90), 0, 0)
# Then X is width, Z is height (up), Y is depth (forward/back)!
# That is the standard 3D orientation for characters!
