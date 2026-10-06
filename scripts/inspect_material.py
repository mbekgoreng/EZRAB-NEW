import bpy

mat = bpy.data.materials.get("PrincipledMaterial")
if mat and mat.use_nodes:
    print("=== NODES in PrincipledMaterial ===")
    for node in mat.node_tree.nodes:
        print(f"Node: {node.name}, type: {node.type}")
        if node.type == 'TEX_IMAGE' and node.image:
            print(f"  image: {node.image.name}, size: {node.image.size[0]}x{node.image.size[1]}")
    print("=== LINKS ===")
    for link in mat.node_tree.links:
        print(f"  {link.from_node.name}.{link.from_socket.name} -> {link.to_node.name}.{link.to_socket.name}")
