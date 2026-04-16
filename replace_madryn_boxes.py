import psycopg2
import re

DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

def run():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    event_id = '2038324a-0e04-497c-9328-fbaeb9ce2992'
    cur.execute('SELECT "htmlContent" FROM "CalendarEvent" WHERE id = %s', (event_id,))
    row = cur.fetchone()
    if not row:
        print("Event not found")
        return
        
    html = row[0]
    
    # We replace everything inside <div class="conf-madryn"> ... </div>
    new_madryn_html = """<div class="conf-madryn">
    <div class="conf-madryn-col">
      <img src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80" alt="Cómo llegar" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:1rem;" />
      <h4>✈️ Cómo llegar</h4>
      <p>Podes llegar a Puerto Madryn a través del Aeropuerto de Puerto Madryn (PMY) o del Aeropuerto de Trelew (REL). 👇</p>
      <a href="https://www.puertomadrynturismo.com.ar/como-llegar/" target="_blank" style="display:inline-block; font-size:0.82rem; color:#013388; font-weight:bold; margin-top:0.5rem; text-decoration:none;">Ver ruta →</a>
    </div>
    <div class="conf-madryn-col">
      <img src="https://images.unsplash.com/photo-1598435165992-16a803ced4b8?w=800&q=80" alt="Turismo en Puerto Madryn" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:1rem;" />
      <h4>🐋 Turismo en Puerto Madryn</h4>
      <p>Paseos, lugares para visitar, hoteles, excursiones, playas, Península Valdés, loberías y más. 👇</p>
      <a href="https://madryn.travel/" target="_blank" style="display:inline-block; font-size:0.82rem; color:#013388; font-weight:bold; margin-top:0.5rem; text-decoration:none;">¿Qué hacer en Pto. Madryn? →</a>
    </div>
    <div class="conf-madryn-col">
      <img src="https://images.unsplash.com/photo-1518182170546-076616fdcbca?w=800&q=80" alt="Conocé Chubut" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:1rem;" />
      <h4>🏔️ Conocé Chubut</h4>
      <p>Lugares increíbles para conocer cercanos a la sede de nuestra Conferencia. 👇</p>
      <a href="https://chubutpatagonia.gob.ar/" target="_blank" style="display:inline-block; font-size:0.82rem; color:#013388; font-weight:bold; margin-top:0.5rem; text-decoration:none;">Turismo cercano →</a>
    </div>
  </div>"""

    # Do the exact sub
    pattern = r'<div class="conf-madryn">.*?</div>\s*</div>' # Wait, </div class="conf-madryn"> closing tag. 
    # Let's be careful with nested divs here
    # The original has:
    # <div class="conf-madryn">
    #   <div class="conf-madryn-col">...</div>
    #   <div class="conf-madryn-col">...</div>
    #   <div class="conf-madryn-col">...</div>
    # </div>
    # We can match it cleanly:
    pattern = r'<div class="conf-madryn">.*?</div>\s*</div>\s*</div>\s*</div>' # No, that's too dangerous.
    
    # Since we know the exact text, we can use a more robust regex that just captures from <div class="conf-madryn"> up to the next </div> that corresponds to it, but regex for nested div is hard.
    # Let's use string split and find.
    start_tag = '<div class="conf-madryn">'
    start_idx = html.find(start_tag)
    if start_idx != -1:
        # find the end of this div by counting, we know it's 3 inner divs.
        # But simpler: replace based on the existing text structure.
        pattern = r'<div class="conf-madryn">.*?<div class="conf-madryn-col">.*?</div>\s*<div class="conf-madryn-col">.*?</div>\s*<div class="conf-madryn-col">.*?</div>\s*</div>'
        html = re.sub(pattern, new_madryn_html, html, flags=re.DOTALL)
        
        cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
        conn.commit()
        print("Successfully replaced content for Puerto Madryn Tourism boxes!")
    else:
        print("Could not find conf-madryn section.")

if __name__ == "__main__":
    run()
