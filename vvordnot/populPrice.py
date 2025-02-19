from datetime import datetime, timedelta
from decimal import Decimal

import yfinance as yf
import mysql.connector
import pandas as pd
from lib.functions import Sql_query, sendemailHtml, get_next_seq_id
from lib.loadprops import *
import os


def buildmess(mydb, sql) :
    mycursor = mydb.cursor(buffered = True)
    yesterday = datetime.today() - timedelta(days=180)
    query = sql.bfin_prod
    mycursor.execute(query)
    prods = mycursor.fetchall()
    prods_dict = {}
    prods_sym = {}
    if len(prods) > 0:
        for prod in prods:
            prod_id = prod[0]
            last_price_check = prod[1]
            sym = prod[2]
            if last_price_check:
                prods_dict[prod_id] = last_price_check
            else:
                prods_dict[prod_id] = yesterday
            prods_sym[prod_id] = sym
        prods_list_sorted = sorted(prods_dict.items(), key=lambda x: x[1])
        # print(type(prods_list_sorted))
        prods_dict_sorted = dict(prods_list_sorted)
        for prod_id, value in prods_dict_sorted.items():
            print(prod_id, ":", prods_sym[prod_id], ":", value)
            query = sql.bfin_price
            args = (prod_id,)
            mycursor.execute(query, args)
            last_price = mycursor.fetchone()
            ticker = yf.Ticker(prods_sym[prod_id])
            his_dt = ticker.history(period="5d")
            lenght = len(his_dt)
            query = sql.bfin_prod_update
            args = (datetime.today(), datetime.today(), prod_id)
            mycursor.execute(query, args)
            mydb.commit()
            if (lenght == 0):
                continue
            serie = his_dt.iloc[0]
            if lenght > 2:
                serie = his_dt.iloc[-2]
            close_date = serie.name.to_pydatetime().replace(tzinfo=None)
            close_price = serie[['Close']].iloc[0]
            cp = Decimal.from_float(close_price)
            cpr = round(cp, 3)
            if last_price:
                last_date = last_price[0]
                print(f'{last_date=} {close_date=} {close_price=}')
                if close_date > last_date:
                    next_id = get_next_seq_id('BfinPrice', mydb, sql)
                    query = sql.bfin_price_insert
                    args = (next_id, prod_id, close_date, cpr, datetime.today(), datetime.today())
                    mycursor.execute(query, args)
                    mydb.commit()
            else:
                next_id = get_next_seq_id('BfinPrice', mydb, sql)
                query = sql.bfin_price_insert
                args = (next_id, prod_id, close_date, cpr, datetime.today(), datetime.today())
                mycursor.execute(query, args)
                mydb.commit()


def main():
    configs = loadprops()
    mydb = mysql.connector.connect(
        host="localhost",
        user=configs.get("DB_User").data,
        password=configs.get("DB_PWD").data,
        database=configs.get("DB_Name").data,
    )
    # mycursor = mydb.cursor(buffered = True)
    dirname, filename = os.path.split(os.path.abspath(__file__))
    sql = Sql_query(dirname + "/sql")
    buildmess(mydb, sql)
    # next_id = get_next_seq_id('BfinProduct', mydb, sql)
    # print(f'{next_id=}')
 
if __name__ == "__main__":
    main()
