from datetime import datetime, timedelta
from decimal import Decimal

import mysql.connector
import pandas as pd
from lib.functions import Sql_query, sendemailHtml
from lib.loadprops import *
from pretty_html_table import build_table


def buildmess(mycursor, sql) -> str:
    yesterday = datetime.today() - timedelta(days=1)
    sql = sql.sql
    args = yesterday, datetime.today()
    mycursor.execute(sql, args)
    myresult = mycursor.fetchall()
    partner = []
    kg = []
    ship_before_date = []
    html = ''
    title = ''
    if len(myresult) > 0:
        partner = []
        kg = []
        ship_before_date = []
        for x in myresult:
            partner.append(x[0])
            kg.append(x[1])
            ship_before_date.append(x[2])

        data = {"Partners": partner, "Hataridő": ship_before_date, "Kg": kg}
        df = pd.DataFrame(data)
        df = df.map(
            lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x
        )
        html = build_table(df, "blue_light")
        title = """<p style="color:#1f1f1f; font-family:Century Gothic,sans-serif; font-weight: bold;">Napi Új rendelések</p>"""
        # print(title)
    return title + html


def buildmess2(mycursor, sql) -> str:
    yesterday = datetime.today() - timedelta(days=1)
    sql2 = sql.sql2
    # sql2 = "SELECT VV_PARTNER.NAME,T2.NAME, T2.ORDER_ID, T2.QUANTITY FROM (SELECT T1.ORDER_ID,T1.PRODUCT_ID,VV_PRODUCT.NAME, T1.PARTNER_ID,T1.QUANTITY,VV_PRODUCT.WEIGHT FROM (SELECT VV_ORDER.ORDER_ID,PRODUCT_ID,PARTNER_ID,QUANTITY FROM VV_ORDER INNER JOIN VV_ORDER_ITEM ON VV_ORDER.ORDER_ID = VV_ORDER_ITEM.ORDER_ID WHERE VV_ORDER.CREATED_STAMP > %s AND VV_ORDER.CREATED_STAMP < %s) AS T1 INNER JOIN VV_PRODUCT ON VV_PRODUCT.PRODUCT_ID = T1.PRODUCT_ID) AS T2 INNER JOIN VV_PARTNER ON VV_PARTNER.PARTNER_ID = T2.PARTNER_ID"
    args = yesterday, datetime.today()
    mycursor.execute(sql2, args)
    myresult = mycursor.fetchall()
    html2 = ''
    if len(myresult) > 0:
        partner2 = []
        prod2 = []
        ord2 = []
        qty2 = []
        for x in myresult:
            partner2.append(x[0])
            prod2.append(x[1])
            ord2.append(x[2])
            qty2.append(x[3])

        data2 = {"Rend.Az.": ord2, "Partners": partner2, "Termék": prod2, "Db": qty2}
        df2 = pd.DataFrame(data2)
        df2 = df2.map(
            lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x
        )
        html2 = build_table(df2, "green_light")
    return html2


def buildmess3(mycursor, sql) -> str:
    sql = sql.sql3
    mycursor.execute(sql)
    myresult = mycursor.fetchall()
    order_ids = []
    ship_before_date = []
    partner_name = []
    order_weight = []
    order_name = []
    prog_net_weight = 0
    title = ''
    html = ''
    if len(myresult) > 0:
        for x in myresult:
            order_id = x[0]
            if order_id not in order_ids:
                order_ids.append(order_id)
                ship_before_date.append(x[1])
                partner_name.append(x[6])
                order_weight.append(x[7])
                order_name.append(x[8])
            qty_to_ship = x[3]
            prod_weight = x[4]
            ord_quantity = x[5]
            if qty_to_ship is not None:
                prog_net_weight += prod_weight * qty_to_ship
            else:
                prog_net_weight += prod_weight * ord_quantity
        # print(f"Progress net weight {prog_net_weight}")
        # print(f"orders list {order_ids}")
        data = {
            "Rend.Az.": order_id,
            "Partner": partner_name,
            "Part.Az.": order_name,
            "Hataridő": ship_before_date,
            "Rendelés Súly (Kg)": order_weight,
        }
        df = pd.DataFrame(data)
        df = df.map(
            lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x
        )
        html = build_table(df, "blue_light")
        # print(f"Progress net weight {prog_net_weight}")
        prog_net_weight_str = f'{prog_net_weight:,.0f}'.replace(',',' ')
        title = f"""<p style="color:#1f1f1f; font-family:Century Gothic,sans-serif; font-weight: bold;">Nyított Rendelések (Kg): {prog_net_weight_str}</p>"""
        # print(title)
    return title + html


def main():
    configs = loadprops()
    mydb = mysql.connector.connect(
        host="localhost",
        user=configs.get("DB_User").data,
        password=configs.get("DB_PWD").data,
        database=configs.get("DB_Name").data,
    )
    mycursor = mydb.cursor()

    # Load sql query
    sql = Sql_query("sql")
    html = buildmess(mycursor, sql)

    html2 = buildmess2(mycursor, sql)
    html3 = buildmess3(mycursor, sql)
    messages = (html, html2, html3)
    htmltable = "\n".join(messages)
    sendemailHtml(htmltable, "rend_subject")


if __name__ == "__main__":
    main()
