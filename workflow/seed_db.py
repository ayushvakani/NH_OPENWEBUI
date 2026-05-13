import asyncio
from openagent.db import engine, AsyncSessionLocal
from openagent.models import Base, Sales

async def seed():
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    print("Seeding sales data...")
    async with AsyncSessionLocal() as session:
        sales_data = [
            Sales(revenue=10000 + i * 500, growth=f'{10+i}%', period=f'2024-{i:02d}-01') 
            for i in range(1, 13)
        ]
        session.add_all(sales_data)
        await session.commit()
    print("DB Seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
