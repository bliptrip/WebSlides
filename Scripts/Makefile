#Makefile for generating various useful media pictures and videos for the presentation
DRONE_MEDIA="/Volumes/BUFFALO\ HD\ /Cranberries/DroneImagery/2018"
SEED_GERMINATION_MEDIA="/Volumes/BUFFALO\ HD\ /Cranberries/SeedGermination"
DIP_SCRIPTS=~/Zalapa/projects/Tools/dip

drone_video_flight_BB02:
		mkdir -p ../static/videos
		~/Zalapa/projects/Drone/Scripts/slice_video.py -i $(DRONE_MEDIA)/Flowering/AA02/ValleyCorp/DJI_Session_02_02.MOV -o ../static/videos/AA02_DJI_Session_02_02.slice.mp4 --seek 30 --length 10 --fps 15 --resize 0.25

generate_field_montage:
		mkdir -p ../static/images/phenotyping/field_montage_thumbnails/
		#IFS=','; cat field_montage_files.csv | head -n 12 | while read file rotate; do ffile=~/Zalapa/projects/Drone/BerryDevelopment/Data/Media/BB02/CranberryCreek/$$file; convert $$ffile -resize '525x525^' -gravity center -crop 525x525+0+0 -rotate $$rotate ../static/images/phenotyping/field_montage_thumbnails/thumbnail_$$file; done
		mfiles=$$(IFS=','; cat field_montage_files.csv | head -n 12 | while read file rotate; do echo ../static/images/phenotyping/field_montage_thumbnails/thumbnail_$$file; done); montage $$mfiles -tile 4x3 -geometry 525x525+8+8 -background 'black' ../static/images/phenotyping/field_montage.jpg

generate_season_video_slideshow:
		#First resize everything
		dos2unix season_imgs.csv
		IFS=','; dirname=../static/images/phenotyping/season/mod; tail -n +2 season_imgs.csv | while read file resize filenewname caption; do file=$${dirname}/$${file}; filenewname=$${dirname}/$${filenewname}; cmd="convert \"$$file\" -resize $${resize} -pointsize 64 -font Helvetica-Narrow-Bold -fill white -undercolor '#00000080' -gravity Center -annotate +10+10 '  $${caption} ' \"$$filenewname\""; echo $$cmd; eval $$cmd; done
		$(DIP_SCRIPTS)/frame2Video.py -d ../static/images/phenotyping/season/mod -c season_imgs.csv -o ../static/videos/season_slideshow.mp4 -r 4
