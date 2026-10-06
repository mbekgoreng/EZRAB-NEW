# Texture sampling
from PIL import Image

# Let's inspect the albedo texture to see how the colors map to the mesh
img = Image.open(r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\maskot\mascot ezrab\albedo.jpg")
print("Image size:", img.size)

# Sample a few pixels:
print("Center (0.5, 0.5):", img.getpixel((img.width//2, img.height//2)))
print("Top-left (0.1, 0.1):", img.getpixel((int(img.width*0.1), int(img.height*0.1))))
print("Top-right (0.9, 0.1):", img.getpixel((int(img.width*0.9), int(img.height*0.1))))
