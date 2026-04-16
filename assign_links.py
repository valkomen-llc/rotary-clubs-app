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
    
    # 1. Inscripciones
    html = re.sub(
        r'<a href="[^"]*"([^>]*)>(?=\s*<img[^>]*alt="Inscripciones")', 
        r'<a href="https://forms.gle/CXWqMj5w335h4qm69" target="_blank"\1>', 
        html
    )
    
    # 2. Confirmá Inscripción - Argentinos
    # Note: alt text in previous html was "Confirmá Inscripción - Argentinos"
    html = re.sub(
        r'<a href="[^"]*"([^>]*)>(?=\s*<img[^>]*alt="Confirmá.*?Argentinos")', 
        r'<a href="https://docs.google.com/forms/d/e/1FAIpQLSe_LAYGDAnFA6rynOHoog_VkZym3lNzzx3Cf3-5wDdTaVWKCQ/viewform" target="_blank"\1>', 
        html
    )
    
    # 3. Confirmá Inscripción - Extranjeros
    html = re.sub(
        r'<a href="[^"]*"([^>]*)>(?=\s*<img[^>]*alt="Confirmá.*?Extranjeros")', 
        r'<a href="https://docs.google.com/forms/d/e/1FAIpQLSedqTXzCNAzYxIbSGIwqfoa_z7VllfWB77lHrbW8_59bpAvGQ/viewform" target="_blank"\1>', 
        html
    )
    
    # 4. Degustación de Vinos -> Revert back to div instead of a
    degustacion_pattern = r'<a href="[^"]*" class="conf-card"[^>]*>(?=\s*<img[^>]*alt="Degustación de vinos").*?</a>'
    
    def replacer(match):
        content = match.group(0)
        # replace starting <a ...> with <div class="conf-card">
        content = re.sub(r'^<a href="[^"]*" class="conf-card"[^>]*>', '<div class="conf-card">', content)
        # replace ending </a> with </div>
        content = re.sub(r'</a>$', '</div>', content)
        return content

    html = re.sub(degustacion_pattern, replacer, html, flags=re.DOTALL)
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully assigned links to cards!")

if __name__ == "__main__":
    run()
