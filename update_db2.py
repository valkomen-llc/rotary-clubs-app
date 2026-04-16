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
    
    # 1. Update Title
    old_title = r'<h2[^>]*>🎟️ Inscripción — Modalidades, Alojamiento y Datos Importantes</h2>'
    new_title = r'<h2 style="font-weight: normal; text-align: center; color: #013388;">🎟️ Inscripción, Modalidades, Alojamiento y Datos Importantes</h2>'
    html = re.sub(old_title, new_title, html)
    
    # 2. Update Grid columns for 2x2
    html = html.replace('grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));', 'grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));')
    
    # 3. Add images to each card
    # Card 1: 🌐 Inscripciones
    html = re.sub(
        r'(<div class="conf-card">\s*)(<h4>🌐 Inscripciones</h4>)',
        r'\g<1><img src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80" alt="Inscripciones"/>\n    \g<2>',
        html
    )
    # Card 2: 🏨 Conferir Huésped Principal
    html = re.sub(
        r'(<div class="conf-card">\s*)(<h4>🏨 Conferir Huésped Principal</h4>)',
        r'\g<1><img src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80" alt="Huésped Principal"/>\n    \g<2>',
        html
    )
    # Card 3: 🗂️ Conferir Sin Alojamiento
    html = re.sub(
        r'(<div class="conf-card">\s*)(<h4>🗂️ Conferir Sin Alojamiento</h4>)',
        r'\g<1><img src="https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&q=80" alt="Sin Alojamiento"/>\n    \g<2>',
        html
    )
    # Card 4: 📋 Registro de Yeos
    html = re.sub(
        r'(<div class="conf-card">\s*)(<h4>📋 Registro de Yeos</h4>)',
        r'\g<1><img src="https://images.unsplash.com/photo-1529390079861-591de354faf5?w=800&q=80" alt="Registro Yeos"/>\n    \g<2>',
        html
    )
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully updated cards, title, and images!")

if __name__ == "__main__":
    run()
