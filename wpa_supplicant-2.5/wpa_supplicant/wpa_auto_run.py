#!/usr/bin/python

import subprocess
import signal
import os
import time
import webbrowser
import sqlite3
import sys, getopt
import argparse
import urlparse
# from urllib.parse import urlparse
import urllib
import os.path
import re
import datetime
import base64
import spotify
import threading
from ws4py.client.threadedclient import WebSocketClient
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import logging
import errno
from socket import error as socket_error
import xml.etree.ElementTree as ET
# import _thread

global conf_file
chromedriver = "/usr/local/bin/chromedriver"
os.environ["webdriver.chrome.driver"] = chromedriver
chrome_options = Options()
chrome_options.add_argument("--disable-sync")
db_name = 'peer_connection_db'
conn_tbl = 'connections'
config_file = "wpa_supplicant.conf"
target_file = config_file + '.tmp'
noob_conf_file = 'eapoob.conf'
keyword = 'Direction'
oob_out_file = '/tmp/noob_output.txt'

def get_timestamp_str():
    ts = time.time()
    formatted_time = datetime.datetime.fromtimestamp(ts).strftime('%Y%m%d_%H%M%S')
    return formatted_time

# Log settings
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create a file handler
LOG_FILE_NAME = "log/client_" + get_timestamp_str() + ".log"
handler = logging.FileHandler(LOG_FILE_NAME)
handler.setLevel(logging.INFO)

# Create a logging format
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)

# Add the handlers to the logger
logger.addHandler(handler)


class Client(WebSocketClient):
    def __init__(self, url, protocols=None, extensions=None, heartbeat_freq=None,
                 ssl_options=None, headers=None):
        super(Client, self).__init__(url, protocols, extensions, heartbeat_freq, ssl_options, headers)
        self.driver = None
        self.volume = 0
        # Assuming a spotify_appkey.key in the current dir
        self.session = spotify.Session()

    def on_connection_state_updated(self, session):
        if session.connection.state is spotify.ConnectionState.LOGGED_IN:
            self.logged_in.set()

    def on_end_of_track(self):
        self.end_of_track.set()

    def opened(self):
        logger.info("Client is up")
        conf = ET.parse('conf.xml')
        root = conf.getroot()

        device_info = {child.tag: child.text for child in root}
        device_str = json.dumps(device_info)
        self.send(device_str)
        print "Client is up"

    def closed(self, code, reason=None):
        logger.info("Closed down %s %s", code, reason)
        print "Closed down", code, reason

    def received_message(self, m):
        try:
            recv_str = m.data.decode('utf-8')
            msg = json.loads(recv_str)
            if self.validate_msg(msg):
                print msg
                if msg['type'] == 'video':
                    self.video_handler(msg)
                elif msg['type'] == 'audio':
                    self.music_hander(msg)
                elif msg['type'] == 'update':
                    self.update_handler(msg)
                elif msg['type'] == 'volume':
                    self.volume_handler(msg)
                elif msg['type'] == 'getContent':
                    self.toplist_handler(msg)
            else:
                pass
        except BaseException, e:
            print e
            # print error message

    def toplist_handler(self, msg):
        print "[TOPLIST] enter"
        user_name = str(msg['source_user_name'])
        passwd = str(msg['source_password'])
        print user_name, passwd
        self.account_login('spotify', user_name, passwd)
        print '[TOPLIST] user has already logged in'
        l = self.get_toplist(10)
        print "get content_list", l
        content = {'Type': 'ContentList', 'ContentList': l, 'UserID': msg['userID']}
        list_str = json.dumps(content)
        logger.info("List str: %s", list_str)
        self.send(list_str)
        print "[TOPLIST] exit"

    def volume_handler(self, msg):
        control = msg['action']
        if control == 'up':
            self.volume = min(self.volume + 1, 20)
        else:
            self.volume = max(self.volume - 1, 0)
        subprocess.call(["amixer", "-D", "pulse", "sset", "Master", str(self.volume * 5) + '%'])

    def validate_msg(self, msg):
        return True

    def video_handler(self, msg):
        """ Support playing youtube video.
        """
        print msg
        # target_url = msg['url']
        action = msg['action']  # play, change

        if self.driver is None:
            self.driver = webdriver.Chrome(chromedriver, chrome_options=chrome_options)
            self.first = True

        # current_url = self.driver.current_url
        if action == 'play':
            target_url = msg['url']
            try:
                self.driver.get(target_url)
            except:
                self.driver = webdriver.Chrome(chromedriver, chrome_options=chrome_options)
                self.driver.get(target_url)
            time.sleep(0.5)
            fullscreen = self.driver.find_elements_by_class_name('ytp-fullscreen-button')[0]
            fullscreen.click()
        elif action == 'change':
            video_status = self.get_video_status()
            print video_status
            logger.info("Change video status")
            # status: 1 means play, 2 means pause
            video = self.driver.find_elements_by_class_name('ytp-play-button')[0]
            video.click()
        else:
            logger.warn("[VIDEO_HANDLER] WTF!")

    def music_hander(self, msg):
        """ Support playing spotify audio
        """
        # target_url = msg['url']
        action = msg['action']  # play, change
        source = msg['source']

        if source == 'spotify':
            if not hasattr(self, 'session'):
                self.account_login('spotify', '***', '****')
            if action == 'play':
                target_url = msg['url']
                self.play_music(target_url)
                self.music_status = 'play'
            elif action == 'change':
                if self.music_status == 'play':
                    self.pause_music()
                    self.music_status = 'pause'
                else:
                    self.play_music()
                    self.music_status = 'play'

    def update_handler(self, msg):
        content = msg['content']
        name = msg['software_name']

        logger.info("software name: %s", name)
        with open('tmp/' + name, 'wb') as f:
            f.write(base64.b64decode(content))

    def get_video_status(self):
        '''
        :return: status 0 means ended, 1 means playing, 2 means paused
        '''
        player_status = self.driver.execute_script("return document.getElementById('movie_player').getPlayerState()")
        return player_status

    def pause_music(self):
        self.session.player.play(False)

    def resume_music(self):
        self.session.player.play()

    def play_music(self, track_uri):
        if self.session.player.state == spotify.player.PlayerState.UNLOADED:  # 'unloaded':
            self.current_uri = track_uri
            track = self.session.get_track(track_uri).load()
            self.session.player.load(track)

        if self.current_uri != track_uri:
            self.current_uri = track_uri
            track = self.session.get_track(track_uri).load()
            self.session.player.load(track)

        self.session.player.play()

    def get_toplist(self, num):
        # result = []
        toplist = self.session.get_toplist(type=spotify.ToplistType.TRACKS, region='US')
        toplist.load()
        tracks = toplist.tracks[:num]
        result = [{'ContentName': track.name, 'ContentType': 'Audio', 'ContentURL': str(track.link), 'Source': 'Spotify'} for track in tracks]
        return result

    # def get_music_url_list(self, num):
    #     toplist.load()
    #
    #
    #     return toplist[:num]
    #
    # def get_music_info_by_url(self, url):
    #     track = self.session.get_track(url)
    #     track.load()
    #     name = track.name
    #     artists = track.artists
    #     artist_str = ""
    #     for artist in artists:
    #         artist_str += artist.load().name

    def account_login(self, source, username, passwd):
        if source == 'spotify':
            if self.session.connection.state is spotify.ConnectionState.LOGGED_IN:
                return

            # Process events in the background
            loop = spotify.EventLoop(self.session)
            loop.start()
            # Connect an audio sink
            try:
                audio = spotify.PortAudioSink(self.session)
            except:
                audio = spotify.AlsaSink(self.session)
            # Events for coordination
            self.logged_in = threading.Event()
            self.end_of_track = threading.Event()
            # Register event listeners
            self.session.on(spotify.SessionEvent.CONNECTION_STATE_UPDATED, self.on_connection_state_updated)
            self.session.on(spotify.SessionEvent.END_OF_TRACK, self.on_end_of_track)
            self.session.login(username, passwd)
            # Wait until flag is set true
            self.logged_in.wait()
            print self.session.user
            # self.session.inbox.load()
            logger.info("User %s successfully logged in.", self.session.user)
            self.logged_in.wait()

def change_config(peerID):
    if peerID is None:
        print ("Peer ID is NULL")
        return

    if os.path.isfile(config_file) is False:
        print ("Config file unavailable")
        return

    old_identity = peerID + '+s1@eap-noob.net'
    new_identity = peerID + '+s2@eap-noob.net'

    read_conf = open(config_file, 'r')
    write_conf = open(target_file, 'w')

    conf_changed = 0;

    for line in read_conf:
        if old_identity in line:
            line = line.replace(old_identity, new_identity)
            write_conf.write(line)
            conf_changed = 1
        else:
            write_conf.write(line)

    if conf_changed is 1:
        write_conf.close()
        read_conf.close()
        cmd = 'cp ' + target_file + ' ' + config_file + '  ;  rm -f ' + target_file
        runbash(cmd)
        reconfigure_peer()


def exec_query(cmd, qtype):
    retval = 0

    res = os.path.isfile(db_name)

    if True != res:
        # print ("No database file found")
        return
    # create a DB connection
    db_conn = sqlite3.connect(db_name)

    # check if DB cannot be accessed
    if db_conn is None:
        print ("DB busy")

    db_cur = db_conn.cursor()

    db_cur.execute(cmd)

    if qtype is 1:
        retval = db_cur.fetchone()
    elif qtype is 0:
        db_conn.commit()

    db_conn.close()
    return retval


def url_to_db(params):
    cmd = 'UPDATE connections SET noob =' + '\'' + params['Noob'][0] + '\'' + ' ,hoob =\'' + params['Hoob'][
        0] + '\'' + ' where PeerID=\'' + params['PeerID'][0] + '\''
    # print (cmd)

    exec_query(cmd, 0)


def parse_qr_code(url):
    url_comp = urlparse(url);

    params = urllib.parse.parse_qs(url_comp.query)

    # print(params)

    url_to_db(params)

    change_config(params['PeerID'][0])


def read_qr_code(arg):
    no_message = True
    # print("In new thread")
    cmd = "zbarcam >" + oob_out_file
    # runbash(cmd)
    subprocess.Popen(cmd, shell=True)

    while no_message:
        time.sleep(2)
        oob_output = open(oob_out_file, 'r')
        for line in oob_output:
            if 'Noob' in line and 'Hoob' in line and 'PeerID' in line:
                no_message = False
        oob_output.close()

    subprocess.Popen("sudo killall zbarcam", shell=True)
    cmd = 'rm -f ' + oob_out_file
    runbash(cmd)
    print (line)
    parse_qr_code(line)


def update_file(signum, frame):
    # print ('Updating File')
    con = sqlite3.connect(db_name)
    c = con.cursor()

    file = open("file.txt", "wb")
    for row in c.execute('select ssid,ServInfo,PeerID,Noob,Hoob,err_code from connections where show_OOB = 1'):
        # print (row[0] + '\n')
        servinfo = json.loads(row[1])

        if (row[5] != 0):
            file.write("Error code: " + str(row[5]))

        line = (row[0].encode(encoding='UTF-8') + b',' + servinfo['ServName'].encode(encoding='UTF-8') + b','
                + servinfo['ServUrl'].encode(encoding='UTF-8') + b'/?PeerId=' + row[2].encode(encoding='UTF-8') +
                b'&Noob=' + row[3].encode(encoding='UTF-8') + b'&Hoob=' + row[4].encode(encoding='UTF-8') + b'\n')
        file.write(line)
    file.close()
    con.close()
    return


def runbash(cmd):
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE)
    out = p.stdout.read().strip()
    return out


def check_wpa():
    return os.path.isfile('wpa_supplicant')


def get_pid(arg):
    pid_list = []
    pname = arg.encode(encoding='UTF-8')
    p = runbash(b"ps -A | grep " + pname)
    if None == p:
        return None

    for line in p.splitlines():
        if pname in line:
            pid = int(line.split(None, 1)[0])
            pid_list.append(pid)
    return pid_list


def prepare(iface):
    pid = get_pid('wpa_supplicant')
    for item in pid:
        os.kill(int(item), signal.SIGKILL)
    # now start your own wpa_supplicant

    print ("start wpa_supplicant")
    cmd = 'rm -f ' + config_file + ' touch ' + config_file + ' ; rm -f ' + db_name
    runbash(cmd)
    conf_file = open(config_file, 'w')
    conf_file.write("ctrl_interface=/var/run/wpa_supplicant \n update_config=1\ndot11RSNAConfigPMKLifetime=65000\n\n")
    conf_file.close()
    cmd = "./wpa_supplicant -i " + iface + " -c wpa_supplicant.conf -O /var/run/wpa_supplicant "
    subprocess.Popen(cmd, shell=True, stdout=1, stdin=None)


def network_scan():
    while True:
        result = runbash("./wpa_cli scan | grep OK")
        if 'OK' == result.decode():
            print ("scan OK")
            return


def get_result():
    scan_result = runbash("wpa_cli scan_result | awk '$4 ~ /WPA2-EAP/ {print $3,$5,$1}' | sort $1")
    conf_file = open(config_file, 'a')
    token = ''
    ssid_list = []
    token_list = []
    for item in scan_result.decode():
        if '\n' == item:
            token_list.append(token)
            if token_list[1] not in ssid_list:
                ssid_list.append(token_list[1])
                conf_file.write("network={\n\tssid=\"" + token_list[1] + "\"\n\tbssid=" + token_list[
                    2] + "\n\tkey_mgmt=WPA-EAP\n\tpairwise=CCMP TKIP"
                         "\n\tgroup=CCMP TKIP\n\teap=NOOB\n\tidentity=\"noob@eap-noob.net\"\n}\n\n")
                token = ''
            token_list[:] = []

        elif ' ' == item:
            token_list.append(token)
            token = ''
        else:
            token += str(item)
    conf_file.close()
    return ssid_list


def reconfigure_peer():
    pid = get_pid('wpa_supplicant')
    print ("Reconfigure wpa_supplicant")
    os.kill(int(pid[0]), signal.SIGHUP)


def check_result():
    res = runbash("./wpa_cli status | grep 'EAP state=SUCCESS'")
    if res == b"EAP state=SUCCESS":
        return True

    return False


def launch_browser():
    url = "test.html"
    webbrowser.open(url, new=1, autoraise=True)


# signal.signal(signal.SIGUSR1, update_file)


def get_direction():
    noob_conf = open(noob_conf_file, 'r')

    for line in noob_conf:
        if '#' != line[0] and keyword in line:
            parts = re.sub('[\s+]', '', line)
            direction = (parts[len(keyword) + 1])

            return direction


def terminate_supplicant():
    pid = get_pid('wpa_supplicant')
    os.kill(int(pid[0]), signal.SIGKILL)


def sigint_handler(signum, frame):
    terminate_supplicant()
    exit(0)

def get_connection_info():
    res = runbash("./wpa_cli status | grep '^ssid='")
    ssid = res.split("=")[1]
    res = runbash("cat file.txt | grep " + ssid)

    strs = res.split(',')[-1].split('/')

    ip_addr = strs[2].split(':')[0]
    peer_id = strs[4].split('&')[0].split('=')[-1]
    logger.info("ip addr: %s  peer id: %s", ip_addr, peer_id)
    return ip_addr, peer_id


def check_if_table_exists():
    # cmd = 'SELECT count(*) FROM information_schema.tables WHERE table_name=\''+conn_tbl+'\''
    cmd = 'SELECT name FROM sqlite_master WHERE type=\'table\''
    while True:
        out = exec_query(cmd, 1)
        if out is not None and out[0] == conn_tbl:
            return
        time.sleep(3)


def main():
    logger.info("Start")
    interface = None
    no_result = 0
    parser = argparse.ArgumentParser()
    parser.add_argument('-i', '--interface', dest='interface')
    args = parser.parse_args()

    if args.interface is None:
        print('Usage:wpa_auto_run.py -i <interface>')
        return

    if not (check_wpa()):
        print ("WPA_Supplicant not found")
        return

    interface = args.interface

    signal.signal(signal.SIGINT, sigint_handler)
    prepare(interface)
    time.sleep(2)
    network_scan()

    while True:
        ssid_list = get_result()
        if len(ssid_list) > 0:
            print (ssid_list)
            break
        time.sleep(2)

    reconfigure_peer()

    direction = get_direction()
    check_if_table_exists()

    if direction is '2':
        print("Server to peer direction")
        # _thread.start_new_thread(read_qr_code, (None,))
    elif direction is '1':
        print("Peer to server direction")
        launch_browser()
    else:
        print("No direction specified")
        terminate_supplicant()
        exit(0)

    while no_result == 0:
        if check_result():
            no_result = 1
        time.sleep(5)
        if direction is '1':
            update_file(None, None)

    logger.info("AUTH SUCCESSFUL!!")
    print (
    "***************************************EAP AUTH SUCCESSFUL *****************************************************")
    cmd = 'sudo ifconfig ' + interface + ' 0.0.0.0 up ; dhclient ' + interface
    runbash(cmd)
    # webbrowser.open_new_tab('https://www.youtube.com')
    ip_addr, peer_id = get_connection_info()
    # ip_addr = '54.161.24.197'
    # peer_id = 'ffUG0D7vUuPasIUkwfm1MqGuyrCnYzGdMBRNeZi8t5hTN9bhpxibXWDumfPk'
    url = 'wss://' + ip_addr + ':9000/' + peer_id
    logger.info("url: %s", url)
    try:
        ws = Client(url, protocols=['http-only', 'chat'])
        ws.connect()
        logger.info("logged in")
        ws.run_forever()
    except KeyboardInterrupt:
        logger.info("User exits the program.")
    except socket_error as serr:
        if serr.errno != errno.ECONNREFUSED:
            raise serr
        # print "==============="
        print (serr)
        logger.info(serr)
    except BaseException as e:
        logger.info(e)
        ws.close()
    finally:
        print ("[FINALLY]")
        if ws.driver:
            ws.driver.close()


if __name__ == '__main__':
    main()
