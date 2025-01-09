from datetime import datetime, timedelta
from decimal import Decimal

import mysql.connector
import pandas as pd
import tabulate

from lib.functions import sendemail

mydb = mysql.connector.connect(
    host="localhost", user="root", password="ofbiz", database="ofbiz"
)

mycursor = mydb.cursor()
yesterday = datetime.today() - timedelta(days=1)
yestStr = yesterday.strftime("%Y-%m-%d")
year = datetime.today().strftime("%Y")
month = datetime.today().strftime("%m")
year = int(year)
month = int(month)
year = 202
month = 12
print(yestStr)
sql = "SELECT T3.NAME, SUM(T3.ORDWEIGHT) FROM (SELECT VV_PARTNER.NAME, T2.ORDER_ID, T2.QUANTITY * T2.WEIGHT AS ORDWEIGHT FROM (SELECT T1.ORDER_ID,T1.PRODUCT_ID,T1.PARTNER_ID,T1.QUANTITY,VV_PRODUCT.WEIGHT FROM (SELECT VV_ORDER.ORDER_ID,PRODUCT_ID,PARTNER_ID,QUANTITY FROM VV_ORDER INNER JOIN VV_ORDER_ITEM ON VV_ORDER.ORDER_ID = VV_ORDER_ITEM.ORDER_ID WHERE ORDER_DATE > %s AND ORDER_DATE < %s) AS T1 INNER JOIN VV_PRODUCT ON VV_PRODUCT.PRODUCT_ID = T1.PRODUCT_ID) AS T2 INNER JOIN VV_PARTNER ON VV_PARTNER.PARTNER_ID = T2.PARTNER_ID) AS T3 GROUP BY T3.ORDER_ID"


sql_and_params = "SELECT * FROM VV_ORDER WHERE ORDER_DATE > %s AND ORDER_DATE < %s"
args = yesterday, datetime.today()
mycursor.execute(sql, args)

myresult = mycursor.fetchall()
partner = []
kg = []

for x in myresult:
    partner.append(x[0])
    kg.append(x[1])

data = {"partners": partner, "kg": kg}
df = pd.DataFrame(data)
df = df.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)

str = tabulate.tabulate(
    df, tablefmt="grid", headers=["Partner", "Súly"], showindex=False
)
print(type(str))
print(str)
sendemail(str)
