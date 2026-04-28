# Research Citations

Working bibliography for Vietnamese MusicXML -> label timing, vần-to-mora mapping, tone handling, and Sinsy/NEUTRINO compatibility.

## Primary Implementation References

- Sinsy `LabelData.cpp`, full-context label serialization and separator layout.  
  https://github.com/r9y9/sinsy/blob/master/src/lib/label/LabelData.cpp

- Sinsy `LabelMaker.cpp`, label field generation for phoneme, syllable, note, slur, dynamics, breath, phrase context.  
  https://github.com/r9y9/sinsy/blob/master/src/lib/label/LabelMaker.cpp

- r9y9/sinsy repository, maintained Sinsy fork used for source inspection.  
  https://github.com/r9y9/sinsy

## Vietnamese Phonology And Tone

- Vietnamese final consonants, tone-bearing rhyme, unreleased final stops.  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6878739/

- Vietnamese phonological encoding, syllable/tone frame, no broad resyllabification.  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9131412/

- Mixdorff et al., quantitative Vietnamese tone synthesis / F0 contour modeling.  
  https://www.isca-archive.org/eurospeech_2003/mixdorff03_eurospeech.pdf

- DBLP record for Mixdorff et al. Vietnamese tone synthesis paper.  
  https://dblp.uni-trier.de/rec/conf/interspeech/MixdorffBFM03.html

- Vietnamese phonology overview, checked-tone restrictions and general phoneme inventory.  
  https://en.wikipedia.org/wiki/Vietnamese_phonology

- Vietnamese syllable structure refresher.  
  https://vietnamesemaestro.com/pronunciation/syllable-structure

## Vietnam-Side Linguistic Sources

- Hoang Cao Cuong, "Suy nghi them ve thanh dieu tieng Viet", cited in bibliography of this paper.  
  https://www.coelang.tufs.ac.jp/common/pdf/research_paper4/063.pdf

- "Dac diem ngu am - am vi hoc cua he thanh dieu...", Tap chi Ngon ngu mirror.  
  https://scholar.dlu.edu.vn/thuvienso/bitstream/DLU123456789/182805/1/CVv281S092022036.pdf

- Tap chi Ngon ngu / DLU mirror, 2023, tone analysis using F0 contour, pitch height, phonation, and duration.  
  https://scholar.dlu.edu.vn/thuvienso/bitstream/DLU123456789/197038/1/CVv281S042023068.pdf

- "Gop them mot meo/quy luat dat dau thanh dieu trong am tiet tieng Viet", Ngon ngu & Doi song.  
  https://vjol.info.vn/index.php/NNDS/article/download/19361/17051/

- "Giai phap thuc hanh cho thanh dieu tieng Viet tren co so ngu am", Ngon ngu & Doi song.  
  https://vjol.info.vn/index.php/NNDS/article/view/16792/15138

- "Giai phap thuc hanh cho thanh dieu tieng Viet tren co so ngu am", PDF mirror.  
  https://vjol.info.vn/index.php/NNDS/article/view/16792/15138

- Vietnamese syllable components, HCM University of Education PDF.  
  https://vjol.info.vn/index.php/sphcm/article/download/30508/25933/

- Vietnamese syllable structure, HCM University of Education PDF.  
  https://vjol.info.vn/index.php/sphcm/article/download/15171/13624/

- "Am tiet va dac diem am tiet tieng Viet", ngonngu.net.  
  https://ngonngu.net/amtiet_tiengviet/60

- "Am vi va he thong am vi tieng Viet", ngonngu.net.  
  https://ngonngu.net/amvi_tiengviet/64

- "Giai phap nang cao nang luc phat am cho hoc vien nguoi Campuchia...", Vietnamese tone teaching reference.  
  https://vjol.info.vn/index.php/tctbgd/article/view/121898

- "Phien thiet - mot phuong phap quan trong", tone system background.  
  https://www.vjol.info.vn/index.php/NNDS/article/download/20212/17733/

- "Thanh dieu Viet o ca the song ngu Khmer - Viet", Ngon ngu & Doi song PDF.  
  https://vjol.info.vn/index.php/NNDS/article/download/10110/9268/

- "Journal of educational equipment: Applied research", Vietnamese tone teaching note.  
  https://vjol.info.vn/index.php/tctbgd/article/download/97276/82215/

- "Co cau ngu am Tieng Viet", Dinh Le Thu / Nguyen Van Hue PDF mirror.  
  https://daitangkinh.truyenphatgiao.com/Resource/H%E1%BB%8Dc-Ti%E1%BA%BFng-Vi%E1%BB%87t/C%C6%A1%20c%E1%BA%A5u%20ng%E1%BB%AF%20%C3%A2m%20Ti%E1%BA%BFng%20Vi%E1%BB%87t-%C4%90inh%20L%C3%AA%20Th%C6%B0%2C%20Nguy%E1%BB%85n%20V%C4%83n%20Hu%E1%BB%87-1998.pdf

- "Cau truc formant cua nguyen am tieng Viet trong ket hop voi am tac va thanh dieu", dissertation mirror.  
  https://www.zbook.vn/ebook/luan-an-cau-truc-formant-cua-nguyen-am-tieng-viet-trong-ket-hop-voi-am-tac-va-thanh-dieu-tren-co-so-khao-sat-thuc-nghiem-55235/

- VnVoice / Vietnamese speech technology project summary: duration, pauses, glottal closure, tone coarticulation.  
  https://www.thuvientailieu.vn/tai-lieu/de-tai-nghien-cuu-phat-trien-cong-nghe-nhan-dang-tong-hop-va-xu-ly-ngon-ngu-tieng-viet-25255/

## Timing, Tempo, Prosody, Intonation

- Fujisaki model applied to Vietnamese intonation and F0 in continuous speech.  
  https://www.cs.cmu.edu/~nbach/papers/Fujisaki_ThaiNguyen082003.pdf

- "Trong am trong tieng Viet", Dai hoc Van Lang.  
  https://vjol.info.vn/index.php/tckhvl/article/view/32859

- Ngon ngu & Doi song, intonation/rhythm note, tone belongs to syllable, intonation to utterance.  
  https://vjol.info.vn/index.php/NNDS/article/download/19314/17010/

- HaUI language/culture PDF, acoustic parameters including F0, intensity, duration, formants.  
  https://jst-haui.vn/media/31/uffile-upload-no-title31804.pdf

- TTS / speech processing overview with Vietnamese tone F0 contours. Lower authority, useful for quick visual model.  
  https://spiderum.com/bai-dang/TTS-Kien-thuc-co-ban-ve-xu-ly-tieng-noi-trong-hoc-may-hoc-sau-P4-LxOSFBWpLLl3

## Singing-Oriented Sources

- "Hien tuong ca si Viet hat lech chuan tieng Viet va loi ca", Tap chi Giao duc Nghe thuat.  
  https://vjol.info.vn/index.php/tcgiaoducnghethuat/article/view/82382

- "Vai tro cua ky thuat legato trong day hoc hat ca khuc Viet Nam", Tap chi Giao duc Nghe thuat.  
  https://vjol.info.vn/index.php/tcgiaoducnghethuat/article/view/95737

- "Day hoc hat dan ca nghi le hat tho...", tone/lyrics and melody relation.  
  https://vjol.info.vn/index.php/tcgiaoducnghethuat/article/download/65565/55250/

- "Tinh dac trung am nhac trong san khau hat boi", Tap chi Khoa hoc Dai hoc Khanh Hoa.  
  https://vjol.info.vn/index.php/dhkh/article/view/47450

- "Danh gia, phan tich cong trinh nghien cuu am nhac dan gian: Tim hieu dieu thuc dan ca nguoi Viet Bac Trung Bo", Tap chi Giao duc Nghe thuat.  
  https://vjol.info.vn/index.php/tcgiaoducnghethuat/article/view/79113

- "Tuong quan giua thanh dieu tieng Viet va ca tu..." song translation / note-tone fit snippet, Ngon ngu & Doi song.  
  https://vjol.info.vn/index.php/NNDS/article/download/19926/17499/

- "Vai tro cua am nhac trong giao duc va phat trien van hoa", melody/lyrics relation.  
  https://vjol.info.vn/index.php/halong/article/download/88727/75341/

- "Thuc trang day hoc hat dan ca tai Khoa Thanh nhac, Hoc vien Am nhac Quoc gia Viet Nam", Tap chi Giao duc Nghe thuat.  
  https://www.vjol.info.vn/index.php/tcgiaoducnghethuat/article/view/114841

- "Thu phap phat trien giai dieu trong mot so ca khuc viet ve Quang Ninh cua nhac si Do Hoa An", Tap chi Khoa hoc Dai hoc Ha Long.  
  https://vjol.info.vn/index.php/halong/article/view/88728

## Lower-Priority Or Adjacent Sources Mentioned

- "Nghien cuu ve nhung anh huong cua dac diem dieu tinh tieng Viet den viec phat am tieng Phap", HCM University of Education.  
  https://vjol.info.vn/index.php/sphcm/article/view/14630

- "Dac diem tu tuong thanh tieng Han", adjacent sound-symbolism source.  
  https://vjol.info.vn/index.php/DHH/article/view/21165

- "Doi chieu nhom phu am tac, vo thanh tieng Anh...", stop consonant/acoustic timing adjacent source.  
  https://vjol.info.vn/index.php/nnvh/article/view/61932

- "So sanh ket cau so sanh ngang bang...", unrelated but surfaced in search.  
  https://vjol.info.vn/index.php/sphcm/article/view/82854

- "Nghien cuu ve loi sai thuong gap khi phat am khinh thanh trong tieng Trung", adjacent pedagogy source.  
  https://vjol.info.vn/index.php/tckhdhBacLieu/article/view/111753

- "Phan bo cua tuc ngu tieng Han...", unrelated search result.  
  https://vjol.info.vn/index.php/jshou/article/view/92196

- "Khao sat thai do cua sinh vien doi voi viec hoc ngu am tieng Anh tich hop ASR...", adjacent ASR/phonetics source.  
  https://vjol.info.vn/index.php/tctbgd/article/view/122657

- "Dac trung van hoa cua thanh ngu chi toc do...", unrelated search result.  
  https://vjol.info.vn/index.php/pyu/article/view/50771

- "Thanh ngu va tuc ngu trong tieng Anh va tieng Viet...", unrelated search result.  
  https://vjol.info.vn/index.php/otn/article/view/103485

- "Dac diem giong dieu trong truong ca su thi hien dai", adjacent literary prosody.  
  https://vjol.info.vn/index.php/sphcm/article/view/14824

- "An du y niem ve soi chi trong thanh ngu va ca dao tieng Viet", unrelated search result.  
  https://vjol.info.vn/index.php/DHSPHN/article/view/56913

- HNUE Journal paper mentioning literature/music relation.  
  https://vjol.info.vn/index.php/DHSPHN/article/download/65536/55223
