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
    
    # 1. Remove the ::before CSS rule that adds the ✅
    html = re.sub(r'\.conf-highlight ul li::before\s*\{\s*content:\s*"✅ ";\s*\}', '', html)

    # 2. Replace the HTML block for the highlight box
    old_box = r'((?:📋\s*)?Todo lo que necesitas saber para la Conferencia[\s\S]*?)</ul>'
    
    new_box = """¿Qué incluye el ticket de USD 550 / USD 625?</h2>
    <ul style="list-style:none; padding:0; margin:1rem 0 0;">
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">🛏️ Estadía en habitación doble Del 23 al 26 de abril de 2026.</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">🎁 Kit de bienvenida y remera de la Conferencia.</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">🍽️ Almuerzo – 25 de abril</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">☕ Coffee Breaks durante las jornadas de capacitación.</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">🌎 Cena “Sabores del LATIR” Una experiencia gastronómica con identidad regional.</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:1px solid rgba(255,255,255,0.12);">✨ Cena de Clausura Noche especial de celebración y encuentro.</li>
      <li style="padding:0.4rem 0; font-size:0.97rem; border-bottom:none;">🌿 Día de Campo – 26 de abril – Actividad recreativa para disfrutar la experiencia patagónica.</li>
    </ul>"""
    
    # Actually just replacing from <h2 inside conf-highlight
    
    new_html = re.sub(r'(<h2[^>]*>).*?(📋\s*)?Todo lo que necesitas saber para la Conferencia.*?<\/ul>', r'\g<1>' + new_box, html, flags=re.DOTALL)
    
    # Verify we modified it
    if new_html != html:
        cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (new_html, event_id))
        conn.commit()
        print("Successfully updated database!")
    else:
        print("No changes made. Regex mismatch.")
        print(html)

if __name__ == "__main__":
    run()
