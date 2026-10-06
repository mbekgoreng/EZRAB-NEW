import bpy
import bmesh

obj = bpy.data.objects.get("input_mesh")
me = obj.data

# Check if there are multiple connected components (islands) in the mesh
bm = bmesh.new()
bm.from_mesh(me)

visited_faces = set()
islands = []

for face in bm.faces:
    if face in visited_faces:
        continue
    island = []
    queue = [face]
    visited_faces.add(face)
    while queue:
        f = queue.pop()
        island.append(f)
        for edge in f.edges:
            for linked_face in edge.link_faces:
                if linked_face not in visited_faces:
                    visited_faces.add(linked_face)
                    queue.append(linked_face)
    islands.append(island)

print(f"Total connected mesh islands in base mesh: {len(islands)}")
for idx, isl in enumerate(islands):
    # compute center of island
    import mathutils
    center = sum((v.co for f in isl for v in f.verts), mathutils.Vector((0,0,0)))
    total_verts = sum(len(f.verts) for f in isl)
    center /= total_verts
    print(f"  Island {idx}: {len(isl)} faces, center: ({center.x:.3f}, {center.y:.3f}, {center.z:.3f})")

bm.free()
