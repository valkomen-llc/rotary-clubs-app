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
    
    # 1. CSS UPDATES
    # Replace the img tag height
    html = re.sub(r'\.conf-card img\s*\{[^}]*\}', '.conf-card img { width: 100%; height: auto !important; object-fit: contain; border-radius: 10px; margin-bottom: 1rem; }', html)
    
    # Add hover effect for cards
    if 'a.conf-card' not in html:
        html = html.replace('.conf-card {', 'a.conf-card { display: block; text-decoration: none; color: inherit; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }\na.conf-card:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.1); }\n.conf-card {')

    # 2. CONVERT DIV TO A
    # Replace <div class="conf-card"> with <a href="#" class="conf-card" target="_blank">
    html = html.replace('<div class="conf-card">', '<a href="#" class="conf-card">')
    
    # We must replace the correctly matching </div> with </a>
    # Since regex for nested divs is hard, but conf-card has no inner divs, we can just do a regex replace
    html = re.sub(r'(<a href="#" class="conf-card">)(.*?)(?=\s*</div>)\s*</div>', r'\1\2\n    </a>', html, flags=re.DOTALL)

    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully converted cards to links and fixed image height!")

if __name__ == "__main__":
    run()
