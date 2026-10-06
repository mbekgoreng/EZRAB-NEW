import fitz # PyMuPDF
import os

def convert_pdf_to_pngs(pdf_path, output_dir, prefix):
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    print(f"Rendering {pdf_path}: {len(doc)} pages")
    
    generated_images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        # Render at 150 DPI for crystal clear inspection
        pix = page.get_pixmap(dpi=150)
        img_filename = f"{prefix}_page_{page_num + 1}.png"
        img_path = os.path.join(output_dir, img_filename)
        pix.save(img_path)
        generated_images.append(img_path)
        print(f"  -> Page {page_num + 1} saved: {img_path} ({pix.width}x{pix.height})")
    
    return generated_images

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(base_dir, "..", ".."))
    pdf_dir = os.path.join(root_dir, "tmp", "pdf_verification")
    out_dir = os.path.join(pdf_dir, "rendered_pages")
    
    free_pdf = os.path.join(pdf_dir, "flagship_project_free_tier.pdf")
    paid_pdf = os.path.join(pdf_dir, "flagship_project_paid_tier.pdf")
    
    if os.path.exists(free_pdf):
        convert_pdf_to_pngs(free_pdf, out_dir, "free")
    if os.path.exists(paid_pdf):
        convert_pdf_to_pngs(paid_pdf, out_dir, "paid")
