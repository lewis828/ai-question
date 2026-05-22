from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATA_DIR

DATABASE_URL = f"sqlite:///{DATA_DIR / 'quizai.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_wrong_count():
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(wrong_records)")).fetchall()
        if rows and "wrong_count" not in {r[1] for r in rows}:
            conn.execute(
                text("ALTER TABLE wrong_records ADD COLUMN wrong_count INTEGER DEFAULT 1")
            )
            conn.commit()


def init_db():
    from app import models  # noqa: F401
    from app.services.sample_bank import seed_sample_bank

    Base.metadata.create_all(bind=engine)
    _migrate_wrong_count()
    with SessionLocal() as db:
        seed_sample_bank(db)
