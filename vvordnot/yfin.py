import yfinance as yf
import numpy as np
from decimal import *



a = 5.9975
print(f'{a=}')
b = np.float64(a)
print(f'{b=}')
c = Decimal.from_float(b)
print(f'{c=}')
d = round(c,3)
print(f'{d=}')


# ticker = yf.Ticker("SXR8.DE")
# historical_data = ticker.history(period="5d")
# print(type(historical_data))
# info = ticker.info
# lastDivValue = info['lastDividendValue']
# lastDivDate= info['lastDividendDate']
# divids = ticker.get_dividends()
# Display a summary of the fetched data
# print(historical_data[['Open', 'High', 'Low', 'Close', 'Volume']])


#for index,row in historical_data.iterrows():
#    print(type(row))
#    print(f'{index=} {row=}')

# print(f'{lastDivDate=} {lastDivValue=}')
# print(f'{info=}')
# print(f'{divids=}')
# print(f'{type(divids)}')

# print(f'len: {len(divids)}')

# last = divids.iloc[-1]
# print(f'{last}')
# print(f'{type(last)}')

# indexes = divids.keys()
# ind = indexes[-1]
# print(f'{ind}')


# index = len(historical_data)-2
# serie = historical_data.iloc[-2]
# print(serie.name, type(serie.name))
# close = serie[['Close']]
# print(f'close: {close} {type(close)}')
# print(f'close: {close.iloc[0]} {type(close.iloc[0])}')
