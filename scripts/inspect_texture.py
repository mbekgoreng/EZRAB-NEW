from PIL import Image
import os

img_path = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\maskot\mascot ezrab\albedo.jpg"
im = Image.open(img_path)
print(f"Albedo size: {im.size}, mode: {im.mode}")

# Let's save a small thumbnail to check or inspect
thumb = im.resize((512, 512))
thumb.save(r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\albedo_preview.jpg")
print("Saved albedo preview to public/models/albedo_preview.jpg")
