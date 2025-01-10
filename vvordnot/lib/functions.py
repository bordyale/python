#!/usr/bin/env python
# modified from http://elinux.org/RPi_Email_IP_On_Boot_Debian
import datetime
import smtplib
from email.mime.text import MIMEText
from lib.loadprops import *



# import urllib2


def sendemail(msgstr):
    # Change to your own account information
    # to = "alessio.bordignon@gmail.com"
    
    configs = loadprops()
    
    recipients = configs.get("recipients").data.split(',')
    gmail_user = configs.get("gmail_user").data
    gmail_password = configs.get("gmail_password").data
    print (recipients)
    smtpserver = smtplib.SMTP("smtp.gmail.com", 587)
    smtpserver.ehlo()
    smtpserver.starttls()
    smtpserver.ehlo
    smtpserver.login(gmail_user, gmail_password)
    today = datetime.date.today()
    # Very Linux Specific
    # arg='ip route list'
    # p=subprocess.Popen(arg,shell=True,stdout=subprocess.PIPE)
    # data = p.communicate()
    # split_data = data[0].split()
    # ipaddr = split_data[split_data.index('src')+1]
    # extipaddr = urllib2.urlopen("http://icanhazip.com").read().decode('utf-8')

    msg = MIMEText(msgstr)
    msg["Subject"] = "Vulkán rendelések rögzítve ezen a napon: %s" % today.strftime(
        "%b %d %Y"
    )
    msg["From"] = gmail_user
    msg["To"] = ", ".join(recipients)
    smtpserver.sendmail(gmail_user, recipients, msg.as_string())
    smtpserver.quit()
    return "ok"
