#!/bin/bash

unicode_version="12.0.0"

for f in `find data -name *.txt`; do
  curl "http://www.unicode.org/Public/$unicode_version/ucd/${f#data/}" > $f;
done
