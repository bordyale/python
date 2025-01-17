from datetime import datetime, timedelta
from decimal import Decimal
from lib.functions import sendemail
import mysql.connector
import pandas as pd
import tabulate
from lib.loadprops import *

def buildmess() -> str:
    configs = loadprops()

    mydb = mysql.connector.connect(
        host="localhost", user=configs.get("DB_User").data, password=configs.get("DB_PWD").data, database=configs.get("DB_Name").data
    )
    mycursor = mydb.cursor()
    yesterday = datetime.today() - timedelta(days=1)
    sql = "SELECT T3.NAME, SUM(T3.ORDWEIGHT) FROM (SELECT VV_PARTNER.NAME, T2.ORDER_ID, T2.QUANTITY * T2.WEIGHT AS ORDWEIGHT FROM (SELECT T1.ORDER_ID,T1.PRODUCT_ID,T1.PARTNER_ID,T1.QUANTITY,VV_PRODUCT.WEIGHT FROM (SELECT VV_ORDER.ORDER_ID,PRODUCT_ID,PARTNER_ID,QUANTITY FROM VV_ORDER INNER JOIN VV_ORDER_ITEM ON VV_ORDER.ORDER_ID = VV_ORDER_ITEM.ORDER_ID WHERE ORDER_DATE > %s AND ORDER_DATE < %s) AS T1 INNER JOIN VV_PRODUCT ON VV_PRODUCT.PRODUCT_ID = T1.PRODUCT_ID) AS T2 INNER JOIN VV_PARTNER ON VV_PARTNER.PARTNER_ID = T2.PARTNER_ID) AS T3 GROUP BY T3.ORDER_ID"
    sql2= "SELECT VV_PARTNER.NAME,T2.NAME, T2.ORDER_ID, T2.QUANTITY FROM (SELECT T1.ORDER_ID,T1.PRODUCT_ID,VV_PRODUCT.NAME, T1.PARTNER_ID,T1.QUANTITY,VV_PRODUCT.WEIGHT FROM (SELECT VV_ORDER.ORDER_ID,PRODUCT_ID,PARTNER_ID,QUANTITY FROM VV_ORDER INNER JOIN VV_ORDER_ITEM ON VV_ORDER.ORDER_ID = VV_ORDER_ITEM.ORDER_ID WHERE ORDER_DATE > %s AND ORDER_DATE < %s) AS T1 INNER JOIN VV_PRODUCT ON VV_PRODUCT.PRODUCT_ID = T1.PRODUCT_ID) AS T2 INNER JOIN VV_PARTNER ON VV_PARTNER.PARTNER_ID = T2.PARTNER_ID"

    sql_and_params = "SELECT * FROM VV_ORDER WHERE ORDER_DATE > %s AND ORDER_DATE < %s"
    args = yesterday, datetime.today()
    mycursor.execute(sql, args)
    myresult = mycursor.fetchall()
    partner = []
    kg = []
    message = ""
    if len(myresult) >= 0:
        partner = []
        kg = []
        for x in myresult:
            partner.append(x[0])
            kg.append(x[1])

        mycursor.execute(sql2, args)
        myresult = mycursor.fetchall()

        partner2 = []
        prod2 = []
        ord2 = []
        qty2 = []
        for x in myresult:
            partner2.append(x[0])
            prod2.append(x[1])
            ord2.append(x[2])
            qty2.append(x[3])

        data = {"partners": partner, "kg": kg}
        data2 = {"partners": partner2, "prod": prod2, "ord" : ord2,"qty" : qty2}
        df = pd.DataFrame(data)
        df2 = pd.DataFrame(data2)
        df = df.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)
        df2 = df2.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)

        str = tabulate.tabulate(
            df, tablefmt="grid", headers=["Partner", "Súly"], showindex=False
        )
        str2 = tabulate.tabulate(
            df2, tablefmt="grid", headers=["Partner", "Termék", "Rendelés szám", "Mennyíség"], showindex=False
        )
        # print(type(str))
        messages = (str, str2)
        message = "\n".join(messages)
        #print(message)
    return message

def main():

    message = buildmess()
    
    sendemail(message,"rend_subject")

if __name__=="__main__":
    main()
