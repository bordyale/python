from datetime import datetime, timedelta
from decimal import Decimal
from lib.functions import sendemailHtml
import mysql.connector
import pandas as pd
import tabulate
from lib.loadprops import *
from pretty_html_table import build_table

def buildmess() -> str:
    configs = loadprops()

    mydb = mysql.connector.connect(
        host="localhost", user=configs.get("DB_User").data, password=configs.get("DB_PWD").data, database=configs.get("DB_Name").data
    )

    mycursor = mydb.cursor()
    startdate = datetime.today() - timedelta(days=5)
    enddate = datetime.today() + timedelta(days=1)
    whquery = "SELECT VV_WAREHOUSE.PRODUCT_ID, SUM(QUANTITY) AS WHQTY, NAME FROM VV_WAREHOUSE INNER JOIN VV_PRODUCT ON VV_WAREHOUSE.PRODUCT_ID = VV_PRODUCT.PRODUCT_ID WHERE STATUS = 'VV_WH_CHANGE_2' AND VV_WAREHOUSE.DATE > %s AND VV_WAREHOUSE.DATE <= %s GROUP BY PRODUCT_ID"
    # whquery = "SELECT PRODUCT_ID, SUM(QUANTITY) AS WHQTY FROM VV_WAREHOUSE WHERE STATUS= 'VV_WH_CHANGE_2' AND VV_WAREHOUSE.DATE > %s AND VV_WAREHOUSE.DATE <= %s GROUP BY PRODUCT_ID"
    shquery = "SELECT VV_PRODUCT.PRODUCT_ID, SUM(QUANTITY) AS SHQTY, NAME FROM VV_SHIPMENT INNER JOIN VV_SHIPMENT_ITEM ON VV_SHIPMENT.SHIPMENT_ID = VV_SHIPMENT_ITEM.SHIPMENT_ID INNER JOIN VV_PRODUCT ON VV_SHIPMENT_ITEM.PRODUCT_ID=VV_PRODUCT.PRODUCT_ID WHERE VV_SHIPMENT.SHIPMENT_DATE > %s AND VV_SHIPMENT.SHIPMENT_DATE <= %s GROUP BY PRODUCT_ID"
    args = startdate, enddate
    mycursor.execute(whquery, args)
    myresult = mycursor.fetchall()
    productId= []
    message = ""
    whqty = []
    whdict = dict()
    if len(myresult) >= 0:
        productId= []
        prodNameWh = []
        whqty = []
        for x in myresult:
            productId.append(x[0])
            whqty.append(x[1])
            prodNameWh.append(x[2])
            whdict[x[0]]=x
            # print(type(x[1]))

        mycursor.execute(shquery, args)
        myresult = mycursor.fetchall()

        productId2= []
        prodName2= []
        shqty = []
        errProdId = []
        errProdName= []
        errWhQty = []
        errShQty = []
        for x in myresult:
            prodId = x[0]
            shquantity = x[1]
            prodName = x[2]
            if prodId not in whdict:
                errProdId.append(prodId)
                errWhQty.append(0)
                errShQty.append(shquantity)
                errProdName.append(prodName)
            elif not shquantity == whdict[prodId][1].copy_abs():
                errProdId.append(prodId)
                errWhQty.append(whdict[prodId][1])
                errShQty.append(shquantity)
                errProdName.append(prodName)
            productId2.append(prodId)
            prodName2.append(prodName)
            shqty.append(shquantity)

        wh = {"productId": productId,"prodName": prodNameWh, "whqty": whqty}
        sh = {"productId": productId2,"prodName": prodName2, "shqty": shqty}
        err = {"Termék Az.": errProdId, "Név": errProdName, "Rakt.Vált.Db": errWhQty, "Szállított Db": errShQty}
        df = pd.DataFrame(wh)
        df2 = pd.DataFrame(sh)
        errDf = pd.DataFrame(err)
        df = df.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)
        df2 = df2.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)
        errDf = errDf.map(lambda x: round(x, 0) if isinstance(x, (int, float, Decimal)) else x)

        html =  build_table(df,'blue_light')
        html2 =  build_table(df2,'green_light')
        html3 =  build_table(errDf,'orange_light')
        #str = tabulate.tabulate(
        #    df, tablefmt="grid", headers=["productId", "whqty"], showindex=False
        #)
        #str2 = tabulate.tabulate(
        #    df2, tablefmt="grid", headers=["productId", "shqty"], showindex=False
        #)
        #errStr = tabulate.tabulate(
        #    errDf, tablefmt="grid", headers=["productId", "prodName", "whqty", "shqty"], showindex=False
        #)
        ## print(type(str))
        #messages = (str2, str, errStr)
        #message = "\n".join(messages)
        messages = (html3, html2, html)
        htmltable= "\n".join(messages)
    return htmltable 

def main():

    message = buildmess()
    
    sendemailHtml(message,"ship_subject")

if __name__=="__main__":
    main()
