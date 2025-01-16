#!/usr/bin/env python
# modified from http://elinux.org/RPi_Email_IP_On_Boot_Debian
import datetime
import smtplib
from email.mime.text import MIMEText
from lib.loadprops import *



# import urllib2


    
configs = loadprops()
    
today = datetime.date.today()
subject = configs.get("passed_subject").data
print(subject)
