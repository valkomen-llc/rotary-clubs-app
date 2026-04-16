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
    
    # 1. Remove border-top from .conf-sponsors in CSS
    html = re.sub(
        r'(\.conf-sponsors\s*\{[^}]*)border-top:\s*1px\s*solid\s*#e5e7eb;?\s*([^}]*\})',
        r'\1\2',
        html
    )
    
    # 2. Make sure there is an <hr> above the p tag, or rearrange it.
    # We will just insert an <hr class="conf-divider"/> before the <p ...>Con el apoyo de
    # Let's find the sponsors section:
    
    sponsors_section_pattern = r'(<!-- ── Sponsors ── -->\s*<div class="conf-section">)\s*(<p style="text-align:center;[^>]*>Con el apoyo de</p>)'
    replacement = r'\1\n  <hr class="conf-divider" style="margin-top:0;" />\n  \2'
    
    if 'Con el apoyo de</p>' in html:
        # Check if we already have an hr
        if '<hr class="conf-divider" style="margin-top:0;" />' not in html:
            html = re.sub(sponsors_section_pattern, replacement, html)
            
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully moved line above text!")

if __name__ == "__main__":
    run()
