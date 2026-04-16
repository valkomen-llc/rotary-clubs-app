import psycopg2
import json
import uuid

DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
CLUB_ID = "857498f8-4836-4c5b-95b2-80d8c073edfc"

sections = {
    "header": {
        "title": "Nuestra Historia",
        "subtitle": "Rotary E-Club Origen"
    },
    "intro": {
        "p1": "Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad.",
        "p2": "Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas."
    },
    "quote": {
        "text": "«Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.»",
        "authorName": "Paul Harris",
        "authorRole": "Fundador de Rotary",
        "authorImage": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face"
    },
    "local": {
        "title": "El nacimiento de Origen",
        "content": "Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el Rotary E-Club Origen, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.\n\nLos socios fundadores que dieron vida al sueño de Origen fueron: Ricardo Jaramillo, Andrés Patiño, Lucas Lasso, Israel David Castellanos, Luz Adriana Bermúdez, Natalia Giraldo y Leidy Viviana Hurtado."
    },
    "timeline": {
        "title": "Una década de impacto",
        "description": "Desde entonces, el E-Club Origen ha liderado proyectos innovadores y solidarios en diversas regiones del país: la campaña #TodoPorNuestrosHéroes durante la pandemia de COVID-19, el programa Origen H2O que lleva agua segura a comunidades rurales, Origen Siembra para la reforestación y la educación ambiental, el embellecimiento urbano con Rotary Pinta Colombia, la entrega de sillas de ruedas a personas en condición de discapacidad, el fortalecimiento de hogares infantiles y juveniles, entre muchos otros.\n\nGracias a la virtualidad y a la pasión de sus socios, el club ha logrado llegar a más de 10 ciudades en Colombia y mantener vínculos internacionales con Guatemala y Brasil, demostrando que la amistad y el servicio rotario no tienen fronteras."
    }
}

def update_history():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    for sec_name, content in sections.items():
        content_json = json.dumps(content)
        
        # Upsert logic
        cur.execute(
            """
            INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (page, section, "clubId")
            DO UPDATE SET content = EXCLUDED.content, "updatedAt" = NOW()
            """,
            (str(uuid.uuid4()), "nuestra-historia", sec_name, content_json, CLUB_ID)
        )
        print(f"Updated section: {sec_name}")

    conn.commit()
    cur.close()
    conn.close()
    print("Successfully updated all history sections.")

if __name__ == "__main__":
    update_history()
