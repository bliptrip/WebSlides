export TOTAL_PERMS_PER_TRAIT ?= 10000
export NUM_CLUSTERS_PER_TRAIT ?= 100
#export NUM_CLUSTERS_PER_TRAIT ?= 1
#if need to explicitly set the START_SEED, don't erase the following but instead comment it out and make a copy with explicitly defined seed.
#Grab the number of seconds since the EPOCH as the start seed
#NOTE: Can set START_SEED explicitly on command-line to override this.
export START_SEED  ?= $(shell date +%s)
#Specify the following based on the versionof R you want to build/use
export R_VERSION ?= R-3.1.2
