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
    prods_div_freq = {}
    if len(prods) > 0:
        for prod in prods:
            prod_id = prod[0]
            last_div_check = prod[3]
            sym = prod[2]
            div_freq_id = prod[4]
            if last_div_check:
                prods_dict[prod_id] = last_div_check
            else:
                prods_dict[prod_id] = yesterday
            prods_sym[prod_id] = sym
            prods_div_freq[prod_id] = div_freq_id
        prods_list_sorted = sorted(prods_dict.items(), key=lambda x: x[1])
        # print(type(prods_list_sorted))
        prods_dict_sorted = dict(prods_list_sorted)
        for prod_id, value in prods_dict_sorted.items():
            print(prod_id, ":", prods_sym[prod_id], ":", value)
            query = sql.bfin_div
            args = (prod_id,)
            mycursor.execute(query, args)
            last_div = mycursor.fetchone()
            ticker = yf.Ticker(prods_sym[prod_id])
            divids = ticker.get_dividends()
            query = sql.bfin_prod_update_div
            args = (datetime.today(), datetime.today(), prod_id)
            mycursor.execute(query, args)
            mydb.commit()
            if (len(divids) == 0):
                continue
            api_div = divids.iloc[-1]
            ddiv = Decimal.from_float(api_div)
            ddivr = round(ddiv, 3)
            indexes = divids.keys()
            api_div_date = indexes[-1].to_pydatetime().replace(tzinfo=None)
            if last_div:
                last_date = last_div[0]
                print(f'{last_date=} {api_div_date=} {api_div=}')
                if api_div_date > last_date:
                    next_id = get_next_seq_id('BfinDividend', mydb, sql)
                    query = sql.bfin_div_insert
                    args = (next_id, prod_id, api_div_date, ddivr, prods_div_freq[prod_id], datetime.today(), datetime.today())
                    mycursor.execute(query, args)
                    mydb.commit()
            else:
                next_id = get_next_seq_id('BfinDividend', mydb, sql)
                query = sql.bfin_div_insert
                args = (next_id, prod_id, api_div_date, ddivr, prods_div_freq[prod_id], datetime.today(), datetime.today())
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
