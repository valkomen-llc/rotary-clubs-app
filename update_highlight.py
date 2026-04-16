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
    
    # 1. Update the CSS for conf-highlight so padding is slightly smaller at the top, or explicitly reset h2 margins
    # Currently: .conf-highlight { background: linear-gradient(135deg, #013388 0%, #0052b4 100%); color: #fff; border-radius: 16px; padding: 2rem; margin: 2rem 0; }
    html = re.sub(
        r'(\.conf-highlight\s*\{[^}]*)padding:\s*2rem;([^}]*\})',
        r'\1padding: 1.2rem 2rem 2rem 2rem;\2',
        html
    )
    
    # Let's also add margin-top: 0 to conf-highlight h2 to negate Tailwind's prose defaults
    html = re.sub(
        r'(\.conf-highlight h2\s*\{[^}]*)color:\s*#fff;([^}]*\})',
        r'\1color: #fff; margin-top: 0;\2',
        html
    )
    
    # 2. Add font-weight: normal to the specific H2
    old_h2 = r'<h2 style="text-align:center; color:#fff;">¿Qué incluye el ticket de USD 550 / USD 625\?</h2>'
    new_h2 = r'<h2 style="text-align:center; color:#fff; font-weight: normal; margin-top: 0;">¿Qué incluye el ticket de USD 550 / USD 625?</h2>'
    # Just to be safe with any spacing or extra styles
    html = re.sub(
        r'<h2([^>]*)>\s*¿Qué incluye el ticket de USD 550 / USD 625\?\s*</h2>',
        r'<h2\1 style="font-weight: normal; margin-top: 0;">¿Qué incluye el ticket de USD 550 / USD 625?</h2>',
        html
    )

    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully updated highlight box styling!")

if __name__ == "__main__":
    run()
