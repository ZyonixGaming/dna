const genesXmlText = `
<exp>
    <gene name="SIZE" m="95" s="100" g0="100" g1="50" g2="35" g3="75" n="ATGC" />
    <gene name="ASPECT" m="95" s="100" g0="200" g1="310" g2="150" g3="250" n="GCAT" />
    <gene name="SKINNY" m="100" s="100" g0="100" g1="200" g2="100" g3="75" n="GACT" />
    <gene name="BONES" m="95" s="100" g0="0" g1="-14" g2="14" g3="0" n="GCAT" />
    <gene name="BONES2" m="60" s="100" g0="0" g1="16" g2="-16" g3="0" n="TGCA" />
    <gene name="CHEST_BIG" m="100" s="100" g0="104" g1="102" g2="108" g3="102" n="ATCG" />
    <gene name="CHEST_SMALL" m="100" s="100" g0="95" g1="100" g2="90" g3="95" n="GCTA" />
    <gene name="GIANT_DWARF" m="100" s="100" g0="100" g1="66" g2="133" g3="100" n="GACT" />
    <gene name="MUSCLE_USE" m="100" s="100" g0="100" g1="50" g2="80" g3="100" n="CTAG" />
    <gene name="QUADRUPED" m="100" s="1" g0="1" g1="0" g2="1" g3="0" n="CGAT" />
    <gene name="BIPED" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="TAGC" />
    <gene name="SPLAY" m="100" s="1" g0="0" g1="10" g2="-5" g3="45" n="ACTG" />
    <gene name="LEG_IN" m="50" s="100" g0="0" g1="18" g2="6" g3="0" n="CGAT" />
    <gene name="LEG_IN2" m="100" s="100" g0="0" g1="13" g2="0" g3="1" n="CGAT" />
    <gene name="GUT" m="100" s="100" g0="0" g1="25" g2="45" g3="0" n="TGAC" />
    <gene name="GUT_IS_UDDER" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="ACGT" />
    <gene name="OSTODERM" m="100" s="1" g0="1" g1="0" g2="1" g3="2" n="GATC" />
    <gene name="OSTO_SIZE" m="85" s="100" g0="30" g1="15" g2="45" g3="45" n="TACG" />
    <gene name="DERRIERE" m="85" s="100" g0="0" g1="40" g2="70" g3="10" n="CTGA" />
    <gene name="SPEED_FACTOR" m="75" s="100" g0="100" g1="30" g2="50" g3="133" n="GCAT" />
    <gene name="BREAK_FORCE" m="100" s="10" g0="0" g1="54" g2="0" g3="35" n="GATC" />
    <gene name="TAIL_TAG" m="100" s="1" g0="3" g1="4" g2="2" g3="1" n="TAGC" />
    <gene name="TAIL_EXISTS" m="100" s="1" g0="1" g1="0" g2="1" g3="2" n="GCAT" />
    <gene name="TAIL_SIZE" m="60" s="100" g0="100" g1="80" g2="120" g3="140" n="GCAT" />
    <gene name="TAIL_SHORT" m="100" s="100" g0="100" g1="50" g2="35" g3="100" n="CAGT" />
    <gene name="TAIL_ASPECT" m="90" s="100" g0="20" g1="10" g2="30" g3="50" n="AGCT" />
    <gene name="TAIL_ANGLE" m="100" s="1" g0="45" g1="90" g2="135" g3="60" n="GCAT" />
    <gene name="TAIL_JOINT_TYPE" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="ATGC" />
    <gene name="TAIL_STIFF" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="ATGC" />
    <gene name="TAIL_SPEED" m="100" s="10" g0="60" g1="200" g2="60" g3="0" n="GCAT" />
    <gene name="TAIL_FLEXIBILITY" m="100" s="1" g0="135" g1="90" g2="45" g3="15" n="GTAC" />
    <gene name="TAIL_SHAPE" m="100" s="1" g0="2" g1="1" g2="5" g3="6" n="AGTC" />
    <gene name="TAIL_BOTTOM" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="GTCA" />
    <gene name="TAIL_SEGMENTS" m="100" s="1" g0="3" g1="0" g2="3" g3="5" n="GTCA" />
    <gene name="LEG_TAG" m="100" s="1" g0="1" g1="2" g2="4" g3="3" n="ATGC" />
    <gene name="LEG_TYPE" m="100" s="1" g0="1" g1="2" g2="0" g3="1" n="TACG" />
    <gene name="LEG_LENGTH" m="90" s="100" g0="80" g1="50" g2="120" g3="100" n="CATG" />
    <gene name="LEG_STRETCH" m="60" s="100" g0="0" g1="14" g2="-14" g3="0" n="GACT" />
    <gene name="LEG_STRETCH2" m="100" s="100" g0="0" g1="-16" g2="16" g3="0" n="ATCG" />
    <gene name="LEG_STRENGTH" m="60" s="100" g0="95" g1="120" g2="80" g3="104" n="GCTA" />
    <gene name="LEG_HAS_FOOT" m="100" s="1" g0="1" g1="1" g2="0" g3="0" n="GACT" />
    <gene name="LEG_JOINT_TYPE" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="AGTC" />
    <gene name="LEG_FLEXIBILITY" m="80" s="1" g0="30" g1="20" g2="40" g3="50" n="GTCA" />
    <gene name="LEG_FLEX_BIAS" m="100" s="1" g0="15" g1="20" g2="10" g3="-10" n="CGAT" />
    <gene name="LEG_THRUST_BACK" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="GCTA" />
    <gene name="LEG_IS_CIRCLE" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="ATGC" />
    <gene name="LEG_COUNT" m="100" s="1" g0="1" g1="1" g2="2" g3="7" n="CGTA" />
    <gene name="LEG_SKEW" m="60" s="100" g0="0" g1="24" g2="-16" g3="0" n="TCGA" />
    <gene name="LEG_PENCIL" m="100" s="100" g0="0" g1="10" g2="0" g3="0" n="ATGC" />
    <gene name="LEG_AND_ARM_LIMP" m="100" s="1" g0="0" g1="0" g2="0" g3="1" n="TAGC" />
    <gene name="HAS_KNEE" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="TCGA" />
    <gene name="KNEE_MIN" m="100" s="1" g0="0" g1="-90" g2="-15" g3="0" n="CGAT" />
    <gene name="KNEE_MAX" m="100" s="1" g0="20" g1="90" g2="45" g3="20" n="TAGC" />
    <gene name="ARM_TAG" m="100" s="1" g0="1" g1="2" g2="4" g3="3" n="GTAC" />
    <gene name="ARM_TYPE" m="100" s="1" g0="1" g1="2" g2="0" g3="0" n="CGAT" />
    <gene name="ARM_LENGTH" m="90" s="100" g0="80" g1="50" g2="120" g3="25" n="ATCG" />
    <gene name="ARM_STRETCH" m="60" s="100" g0="0" g1="14" g2="-14" g3="0" n="GACT" />
    <gene name="ARM_STRETCH2" m="100" s="100" g0="0" g1="-16" g2="16" g3="0" n="TCAG" />
    <gene name="ARM_STRENGTH" m="60" s="100" g0="95" g1="120" g2="80" g3="104" n="ATCG" />
    <gene name="ARM_HAS_HAND" m="100" s="1" g0="1" g1="0" g2="1" g3="0" n="CGTA" />
    <gene name="ARM_JOINT_TYPE" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="GCTA" />
    <gene name="ARM_FLEXIBILITY" m="100" s="1" g0="30" g1="20" g2="40" g3="30" n="ACTG" />
    <gene name="ARM_FLEX_BIAS" m="100" s="1" g0="15" g1="20" g2="10" g3="0" n="GCTA" />
    <gene name="ARM_FORWARD" m="100" s="1" g0="-20" g1="0" g2="60" g3="40" n="CTGA" />
    <gene name="ARM_SKEW" m="100" s="100" g0="0" g1="20" g2="-20" g3="0" n="TCGA" />
    <gene name="ARM_NODE_SCALE" m="50" s="100" g0="100" g1="70" g2="130" g3="100" n="CTGA" />
    <gene name="HAS_ELBOW" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="CATG" />
    <gene name="ELBOW_RANGE" m="100" s="1" g0="30" g1="90" g2="10" g3="30" n="CTAG" />
    <gene name="UPARM_TAG" m="100" s="1" g0="0" g1="2" g2="1" g3="4" n="ATCG" />
    <gene name="UPARM_Y" m="80" s="100" g0="30" g1="10" g2="30" g3="50" n="CTAG" />
    <gene name="UPARM_ANGLE" m="100" s="1" g0="0" g1="30" g2="-30" g3="-45" n="GCAT" />
    <gene name="UPARM_GOOFY" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="ACGT" />
    <gene name="NECK_TAG" m="100" s="1" g0="4" g1="3" g2="1" g3="2" n="AGTC" />
    <gene name="NECK_TYPE" m="100" s="1" g0="1" g1="1" g2="2" g3="0" n="TACG" />
    <gene name="NECK_LENGTH" m="90" s="100" g0="60" g1="70" g2="90" g3="30" n="ATGC" />
    <gene name="NECK_GIRAFFE" m="90" s="100" g0="110" g1="0" g2="85" g3="120" n="TCAG" />
    <gene name="NECK_THICKNESS" m="60" s="100" g0="95" g1="110" g2="120" g3="80" n="CGTA" />
    <gene name="NECK_ANGLE" m="90" s="1" g0="45" g1="30" g2="60" g3="75" n="TACG" />
    <gene name="NECK_COCK" m="100" s="1" g0="0" g1="30" g2="20" g3="-25" n="CGAT" />
    <gene name="NECK_JOINT_TYPE" m="100" s="1" g0="1" g1="0" g2="2" g3="0" n="TGCA" />
    <gene name="NECK_FLEXIBILITY" m="100" s="1" g0="23" g1="10" g2="40" g3="0" n="GTCA" />
    <gene name="NECK_FLEX_BIAS" m="100" s="1" g0="-8" g1="0" g2="-25" g3="30" n="GATC" />
    <gene name="NECK_SLOUCH" m="60" s="100" g0="0" g1="50" g2="20" g3="0" n="CTGA" />
    <gene name="NECK_ONTOP" m="100" s="100" g0="0" g1="50" g2="70" g3="20" n="GTCA" />
    <gene name="NECK_STIFF" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="CATG" />
    <gene name="NECK_SPEED" m="100" s="10" g0="60" g1="25" g2="50" g3="10" n="AGCT" />
    <gene name="HAS_FOOT" m="100" s="1" g0="1" g1="0" g2="1" g3="0" n="TACG" />
    <gene name="FOOT_SIZE" m="60" s="100" g0="0" g1="20" g2="12" g3="30" n="GTAC" />
    <gene name="FOOT_CLOWN" m="100" s="100" g0="0" g1="30" g2="0" g3="0" n="GTAC" />
    <gene name="FOOT_THICKNESS" m="80" s="100" g0="20" g1="15" g2="30" g3="7" n="TCAG" />
    <gene name="FOOT_TOE" m="100" s="100" g0="100" g1="0" g2="50" g3="100" n="AGCT" />
    <gene name="FOOT_IS_CIRCLE" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="GACT" />
    <gene name="FOOT_BACKWARDS" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="AGCT" />
    <gene name="HAS_HAND" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="CGTA" />
    <gene name="HAND_WIDTH" m="100" s="100" g0="0" g1="7" g2="20" g3="0" n="GACT" />
    <gene name="HAND_LENGTH" m="90" s="100" g0="20" g1="30" g2="15" g3="20" n="CGAT" />
    <gene name="HAND_FINGER" m="80" s="100" g0="0" g1="100" g2="0" g3="50" n="CTGA" />
    <gene name="HEAD_SIZE" m="95" s="100" g0="100" g1="50" g2="133" g3="75" n="GCTA" />
    <gene name="HEAD_THICK_SKULL" m="100" s="100" g0="0" g1="20" g2="0" g3="0" n="TGAC" />
    <gene name="HEAD_X_GROWTH" m="100" s="100" g0="0" g1="5" g2="10" g3="-5" n="ACGT" />
    <gene name="HEAD_Y_GROWTH" m="100" s="100" g0="0" g1="5" g2="-5" g3="0" n="TACG" />
    <gene name="HEAD_ASPECT" m="85" s="100" g0="200" g1="175" g2="250" g3="300" n="TCAG" />
    <gene name="HEAD_SQUARE" m="100" s="100" g0="0" g1="150" g2="100" g3="0" n="CTAG" />
    <gene name="HEAD_HAS_BACK" m="100" s="1" g0="11" g1="0" g2="0" g3="1" n="GTCA" />
    <gene name="HEAD_GIANT" m="90" s="100" g0="100" g1="200" g2="180" g3="100" n="CTAG" />
    <gene name="HEAD_SHRUNK" m="90" s="100" g0="100" g1="70" g2="50" g3="100" n="CATG" />
    <gene name="HEAD_JOINTED" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="CATG" />
    <gene name="HEAD_CHIMERA" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="ATCG" />
    <gene name="EYE_STYLE" m="100" s="1" g0="1" g1="2" g2="1" g3="0" n="CATG" />
    <gene name="BUGEYE" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="GACT" />
    <gene name="EYEBOX_X" m="90" s="100" g0="33" g1="0" g2="50" g3="15" n="AGCT" />
    <gene name="EYEBOX_Y" m="100" s="100" g0="-100" g1="0" g2="-50" g3="-25" n="CGTA" />
    <gene name="EYEBOX_SIZE" m="60" s="100" g0="25" g1="15" g2="33" g3="50" n="ATGC" />
    <gene name="EYE_SIZE" m="100" s="100" g0="50" g1="75" g2="125" g3="50" n="ACTG" />
    <gene name="PUPIL_SIZE" m="100" s="100" g0="66" g1="80" g2="40" g3="40" n="CAGT" />
    <gene name="HAS_PUPIL" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="ATCG" />
    <gene name="BROW_SIZE" m="100" s="100" g0="0" g1="150" g2="125" g3="0" n="GATC" />
    <gene name="BROW_SLANT" m="100" s="1" g0="0" g1="-15" g2="15" g3="0" n="GTAC" />
    <gene name="EAR_STYLE" m="100" s="1" g0="1" g1="2" g2="0" g3="0" n="TGCA" />
    <gene name="EAR_SHAPE" m="100" s="1" g0="2" g1="1" g2="4" g3="2" n="CGAT" />
    <gene name="EAR_FLOP" m="100" s="1" g0="0" g1="30" g2="60" g3="200" n="CTAG" />
    <gene name="EAR_X" m="90" s="100" g0="0" g1="100" g2="50" g3="0" n="TAGC" />
    <gene name="EAR_SIZE" m="70" s="100" g0="20" g1="30" g2="10" g3="40" n="TCGA" />
    <gene name="EAR_ASPECT" m="100" s="100" g0="100" g1="250" g2="300" g3="100" n="ATCG" />
    <gene name="EAR_SLANT" m="70" s="100" g0="0" g1="100" g2="50" g3="-33" n="GACT" />
    <gene name="EAR_INTERIOR" m="100" s="100" g0="5" g1="0" g2="0" g3="0" n="TAGC" />
    <gene name="TEETH_SHAPE" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="TCGA" />
    <gene name="HAS_MOUTH" m="100" s="1" g0="1" g1="1" g2="0" g3="1" n="TCGA" />
    <gene name="MOUTH_Y" m="80" s="100" g0="70" g1="84" g2="50" g3="100" n="CGAT" />
    <gene name="MOUTH_SIZE" m="70" s="100" g0="20" g1="30" g2="10" g3="40" n="CTGA" />
    <gene name="JAW" m="50" s="100" g0="0" g1="15" g2="-8" g3="-13" n="CAGT" />
    <gene name="TEETH_UPPER" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="GATC" />
    <gene name="TEETH_UPPER2" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="CATG" />
    <gene name="TONGUE" m="100" s="100" g0="0" g1="40" g2="60" g3="0" n="CGAT" />
    <gene name="TONGUE_SEGS" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="ACGT" />
    <gene name="NOSE_STYLE" m="100" s="1" g0="1" g1="2" g2="3" g3="0" n="GTCA" />
    <gene name="NOSE_INNY" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="GCTA" />
    <gene name="NOSE_Y" m="90" s="100" g0="0" g1="100" g2="50" g3="0" n="CTAG" />
    <gene name="NOSE_SIZE" m="70" s="100" g0="10" g1="5" g2="20" g3="100" n="AGCT" />
    <gene name="NOSE_INTERIOR" m="100" s="100" g0="0" g1="100" g2="50" g3="0" n="ATGC" />
    <gene name="HAS_ANTLERS" m="100" s="1" g0="1" g1="0" g2="1" g3="1" n="CTGA" />
    <gene name="ANTLER_X" m="100" s="1" g0="1" g1="0" g2="2" g3="1" n="TGAC" />
    <gene name="ANTLER_W" m="100" s="100" g0="15" g1="12" g2="8" g3="12" n="TACG" />
    <gene name="ANTLER_H" m="80" s="100" g0="65" g1="45" g2="100" g3="25" n="TACG" />
    <gene name="ANTLER_TAPER" m="100" s="100" g0="0" g1="100" g2="50" g3="100" n="CGAT" />
    <gene name="ANTLER_POM" m="100" s="100" g0="0" g1="150" g2="200" g3="100" n="CTGA" />
    <gene name="ANTLER_COLOR" m="100" s="1" g0="2" g1="8" g2="1" g3="3" n="ACGT" />
    <gene name="POM_COLOR" m="100" s="1" g0="2" g1="0" g2="1" g3="17" n="GCTA" />
    <gene name="POM_USECOLOR" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="GTAC" />
    <gene name="ANTLER_REC" m="100" s="1" g0="2" g1="1" g2="3" g3="0" n="TAGC" />
    <gene name="ANTLER_REC2" m="100" s="1" g0="2" g1="1" g2="3" g3="0" n="CTGA" />
    <gene name="ANTLER_FLIP" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="TACG" />
    <gene name="ANTLER_MOD" m="100" s="1" g0="3" g1="2" g2="1" g3="3" n="TCAG" />
    <gene name="ANTLER_SCALEH" m="80" s="100" g0="100" g1="75" g2="40" g3="100" n="GCTA" />
    <gene name="ANTLER_SCALEW" m="100" s="100" g0="100" g1="75" g2="50" g3="100" n="TCGA" />
    <gene name="ANTLER_ANGLE" m="100" s="1" g0="45" g1="-45" g2="-25" g3="25" n="GATC" />
    <gene name="ANTLER_ANGLE2" m="100" s="1" g0="45" g1="-45" g2="90" g3="-90" n="ACTG" />
    <gene name="ANTLER_ANGLE_RAND" m="100" s="1" g0="0" g1="5" g2="45" g3="15" n="GTAC" />
    <gene name="ANTLER_T1" m="100" s="100" g0="0" g1="100" g2="40" g3="25" n="CGAT" />
    <gene name="ANTLER_T2" m="100" s="100" g0="100" g1="40" g2="0" g3="25" n="ATGC" />
    <gene name="HAT_EXISTS" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="ACTG" />
    <gene name="HAT_SIZE" m="85" s="100" g0="60" g1="40" g2="100" g3="20" n="CATG" />
    <gene name="HAT_RAKE" m="100" s="100" g0="0" g1="25" g2="-15" g3="0" n="AGTC" />
    <gene name="HAT_ASPECT" m="85" s="100" g0="100" g1="300" g2="200" g3="100" n="ATGC" />
    <gene name="HAT_TAPER" m="100" s="100" g0="0" g1="100" g2="50" g3="0" n="TGCA" />
    <gene name="HAT_POM" m="100" s="100" g0="0" g1="25" g2="50" g3="0" n="TGAC" />
    <gene name="HAT_POM_IS_LID" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="TAGC" />
    <gene name="HAT_CLONE" m="100" s="100" g0="0" g1="33" g2="66" g3="0" n="CGTA" />
    <gene name="HAT_BACK_SCALE" m="100" s="100" g0="100" g1="0" g2="60" g3="100" n="TAGC" />
    <gene name="HAT_FRONT_SCALE" m="100" s="100" g0="100" g1="0" g2="60" g3="100" n="CGTA" />
    <gene name="HAT_BACK_ANGLE" m="75" s="1" g0="45" g1="90" g2="120" g3="60" n="ACGT" />
    <gene name="HAT_FRONT_ANGLE" m="100" s="1" g0="-45" g1="-90" g2="-120" g3="-60" n="CGAT" />
    <gene name="HAT_ANGLE_RAND" m="100" s="1" g0="0" g1="15" g2="45" g3="15" n="TCGA" />
    <gene name="HAT_FLIP" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="TACG" />
    <gene name="HAT_T" m="100" s="100" g0="0" g1="100" g2="40" g3="0" n="GTAC" />
    <gene name="BASE_BROWN" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="ATCG" />
    <gene name="BASE_BLACK" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="TGCA" />
    <gene name="BASE_RED" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="GTCA" />
    <gene name="BASE_GREEN" m="70" s="1" g0="0" g1="1" g2="2" g3="3" n="TCAG" />
    <gene name="GREEN_KNOCKOUT" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="CAGT" />
    <gene name="BASE_CREAM" m="50" s="100" g0="0" g1="100" g2="0" g3="0" n="AGCT" />
    <gene name="ALT_BLUE" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="TAGC" />
    <gene name="SPOT_YELLOW" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="TGCA" />
    <gene name="SKIN_HUE" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="CGAT" />
    <gene name="SKIN_HUE2" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="TAGC" />
    <gene name="SWAP_BASE_SPOT" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="ATCG" />
    <gene name="SWAP_ALT_SPOT" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="TGCA" />
    <gene name="WHITE" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="TAGC" />
    <gene name="WHITE_IS_LETHAL" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="AGCT" />
    <gene name="EYE_HUE" m="100" s="1" g0="36" g1="237" g2="153" g3="198" n="GCTA" />
    <gene name="NOSE_HUE" m="100" s="1" g0="0" g1="1" g2="2" g3="3" n="GACT" />
    <gene name="HOOF_COLOR" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="CTAG" />
    <gene name="AGOUTI" m="100" s="1" g0="1" g1="0" g2="0" g3="1" n="ATGC" />
    <gene name="BELLY_ALT" m="100" s="1" g0="0" g1="1" g2="2" g3="1" n="TACG" />
    <gene name="SKIN_HEAD" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="GCAT" />
    <gene name="SKIN_HANDS" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="GCAT" />
    <gene name="FOOT_IS_HOOF" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="GACT" />
    <gene name="RACCOON_EYE" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="GCAT" />
    <gene name="EAR_COMP" m="100" s="1" g0="0" g1="0" g2="2" g3="1" n="GTCA" />
    <gene name="TAIL_ALT" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="CGTA" />
    <gene name="PAT_SPLIT" m="100" s="100" g0="0" g1="100" g2="65" g3="0" n="CGAT" />
    <gene name="PAT_BELLY" m="100" s="100" g0="100" g1="50" g2="33" g3="75" n="ACTG" />
    <gene name="PAT_STRIPE" m="100" s="100" g0="0" g1="90" g2="51" g3="0" n="CTAG" />
    <gene name="PAT_SPOT" m="100" s="100" g0="0" g1="90" g2="51" g3="0" n="ACGT" />
    <gene name="PAT_PERLIN" m="100" s="100" g0="0" g1="100" g2="60" g3="0" n="TCAG" />
    <gene name="PAT_PERLIN2" m="100" s="100" g0="0" g1="100" g2="60" g3="0" n="GTCA" />
    <gene name="PAT_PERLIN_SIZE" m="100" s="1" g0="8" g1="2" g2="4" g3="4" n="GACT" />
    <gene name="RAMPAGE" m="100" s="1" g0="0" g1="0" g2="0" g3="1" n="GATC" />
    <gene name="SPINAL_LOCO" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="CTGA" />
    <gene name="BRAIN_SPASTIC" m="100" s="1" g0="0" g1="1" g2="2" g3="0" n="TGAC" />
    <gene name="HIGH_INTELLECT" m="100" s="1" g0="0" g1="1" g2="0" g3="1" n="CTAG" />
    <gene name="OMNIVORE" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="CATG" />
    <gene name="LITTER_SIZE" m="100" s="1" g0="1" g1="2" g2="3" g3="5" n="CTAG" />
    <gene name="OLD_AGE" m="100" s="1" g0="0" g1="0" g2="-1" g3="2" n="TACG" />
    <gene name="LIMP" m="100" s="1" g0="0" g1="1" g2="0" g3="2" n="AGTC" />
    <gene name="NARCOLEPSY" m="100" s="1" g0="0" g1="0" g2="1" g3="0" n="TCGA" />
    <gene name="FLU_IMMUNITY" m="100" s="1" g0="0" g1="0" g2="0" g3="1" n="CATG" />
    <gene name="TAIL_WAG" m="100" s="1" g0="1" g1="0" g2="0" g3="0" n="CTGA" />
    <gene name="STIFF_JOINTS" m="100" s="100" g0="0" g1="18" g2="50" g3="0" n="CGAT" />
    <gene name="L_LEG_SIGNAL" m="100" s="1" g0="1" g1="1" g2="1" g3="2" n="GTCA" />
    <gene name="L_LEG_FTOB_REACT" m="100" s="1" g0="1" g1="2" g2="1" g3="3" n="TCAG" />
    <gene name="L_LEG_FTOB_EVENT" m="100" s="1" g0="3" g1="1" g2="2" g3="4" n="GATC" />
    <gene name="L_LEG_BTOF_REACT" m="100" s="1" g0="2" g1="1" g2="2" g3="3" n="ACGT" />
    <gene name="L_LEG_BTOF_EVENT" m="100" s="1" g0="2" g1="3" g2="1" g3="4" n="TGAC" />
    <gene name="L_ARM_SIGNAL" m="100" s="1" g0="2" g1="2" g2="2" g3="1" n="CGAT" />
    <gene name="L_ARM_FTOB_REACT" m="100" s="1" g0="2" g1="1" g2="2" g3="3" n="ACGT" />
    <gene name="L_ARM_FTOB_EVENT" m="100" s="1" g0="3" g1="1" g2="2" g3="4" n="TGAC" />
    <gene name="L_ARM_BTOF_REACT" m="100" s="1" g0="1" g1="2" g2="1" g3="3" n="GATC" />
    <gene name="L_ARM_BTOF_EVENT" m="100" s="1" g0="2" g1="3" g2="1" g3="4" n="CATG" />
    <gene name="L_TAIL_SIGNAL" m="100" s="1" g0="3" g1="1" g2="2" g3="4" n="ACTG" />
    <gene name="L_TAIL_FTOB_REACT" m="100" s="1" g0="0" g1="1" g2="3" g3="2" n="CGAT" />
    <gene name="L_TAIL_FTOB_EVENT" m="100" s="1" g0="1" g1="2" g2="3" g3="4" n="TCGA" />
    <gene name="L_TAIL_BTOF_REACT" m="100" s="1" g0="0" g1="1" g2="3" g3="2" n="GTCA" />
    <gene name="L_TAIL_BTOF_EVENT" m="100" s="1" g0="2" g1="1" g2="3" g3="4" n="ATCG" />
    <gene name="L_NECK_SIGNAL" m="100" s="1" g0="4" g1="1" g2="2" g3="3" n="TGAC" />
    <gene name="L_NECK_FTOB_REACT" m="100" s="1" g0="0" g1="1" g2="4" g3="2" n="GTAC" />
    <gene name="L_NECK_FTOB_EVENT" m="100" s="1" g0="1" g1="2" g2="3" g3="4" n="CATG" />
    <gene name="L_NECK_BTOF_REACT" m="100" s="1" g0="0" g1="1" g2="4" g3="2" n="TCAG" />
    <gene name="L_NECK_BTOF_EVENT" m="100" s="1" g0="2" g1="1" g2="3" g3="4" n="TCAG" />
    <gene name="LOCO_SYNC" m="100" s="1" g0="0" g1="1" g2="0" g3="0" n="CTGA" />
</exp>

`;



const DEFAULT_N="GATC";

// Map [HELIX][POSITION] to ID
const GENE_MAP = [
  "03041011072026396254",
  "0e0f122d5b8586c1c9d4d5d3d6",
  "081c2a2b1e1d313a3d3e5051d1",
  "0b0c0d1a1b293233343c42434f6ada",
  "22282e2c353b4852531479",
  "090a4445473f46bc",
  "0001020506494a4b4c4d4e",
  "15161718191f21d9",
  "2324252f27303637384041",
  "565758595a5c5d5e5f60c3",
  "61636465666768696b6e6f70c2",
  "6c6d7172737475bd76777a7b7c7d78",
  "7e7f80818283848788898a8bd8",
  "8c8d8e8f9091929394a5a6",
  "95969798999a9b9c9d9e9f",
  "a0a1a2a3a4a7a8a9aaabacadae",
  "afb0b1b2b3b4b5b6b7b8b9babbbebf",
  "c0c4c5c6c7c8cacbcccdce",
  "d71355cfd0d2dbe0e5eaef",
  "dcdddedfe1e2e3e4e6e7e8e9ebecedee"
].map(line =>			  
  line.match(/.{1,2}/g).map(h => parseInt(h, 16))
);

const HELIX_LENGTHS = GENE_MAP.map(row => row.length);

const GENE_COUNT = HELIX_LENGTHS.reduce((sum, row) => sum + row, 0); //can update to use helix_lengths instead
// Map ID to [HELIX,POSITION]

const HELIX_MAP = new Array(GENE_COUNT);

// Iterate over each row (chromosome index) and column (position index)
for (let i = 0; i < GENE_MAP.length; i++) {
	const row = GENE_MAP[i];
	for (let j = 0; j < row.length; j++) {
	  const geneId = row[j];
	  // Store coordinates [i, j] at the index equal to geneId
	  HELIX_MAP[geneId] = [i, j];
	}
}

const arrayHp = GENE_MAP.map(row => new Array(row.length));

//Lookup
const geneById = new Map();
//const geneByHp = new Map();
const geneByDesc = new Map();

// ========== Build completeMapping from a data source ==========
let completeMapping = new Map();


// ========== Try XML, fallback to classic ==========
const XML_URL = './data/genes.xml';


async function loadGeneDataFromXml(xmlString="") {
	function precomputeValueMatrix(g,m) {
	 // const n = entry.n;        // e.g. "TGCA" – priority order
	  //const g = entry.g;        // array of 4 values, order follows n
	  //const m = entry.m;        // blending percentage
	  
	  // Create a 4x4 matrix filled with zeros
	  const matrix = Array(4).fill().map(() => Array(4).fill(0));

	  // List of bases in fixed order (A,C,G,T)

	  for (let idx1 = 0; idx1 < 4; idx1++) {

		for (let idx2 = idx1; idx2 < 4; idx2++) {
		  // Determine dominant and recessive based on priority order
		  //const domIdx = idx1 < idx2 ? idx1 : idx2;
		  //const recIdx = idx1 > idx2 ? idx1 : idx2;

		  //const domVal = g[domIdx];
		  const domVal = g[idx1];
		  //console.log(domVal);
		  //const recVal = g[recIdx];
		  const recVal = g[idx2];
		  //console.log(recVal);

		  let value;
		  if (m >= 100) {
			value = domVal;
		  } else {
			value = Math.floor((domVal * m + recVal * (100 - m)) / 100);
		  }

		  matrix[idx1][idx2] = value;
		  if(idx2>idx1){
			  matrix[idx2][idx1] = value;
		  }
		  
		}
	  }

	  //entry.valueMatrix = matrix;
	  return matrix;
	}
  let xmlText;
  if(xmlString.length>0){
	  xmlText=xmlString;
  }
  else{
	  try {
		const response = await fetch(XML_URL);
		if (!response.ok) throw new Error(`Status ${response.status}`);
		xmlText = await response.text();
	  }catch(e){
		xmlText=genesXmlText;
	  }
  }
  
  try{
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const xmlDataMap = new Map();
	let geneIndex = 0;
	geneById.clear();
	//geneByHp.clear();
	geneByDesc.clear();
    xmlDoc.querySelectorAll('gene').forEach(gene => {
      const name = gene.getAttribute('name');
      if (!name) return;	  
	  const h = HELIX_MAP[geneIndex][0];
	  const p = HELIX_MAP[geneIndex][1];
	 // const hp = helix + ":" + position;
	  const n = gene.getAttribute('n') || 'TGCA';
	  const g = [parseInt(gene.getAttribute('g0'),10)||0,parseInt(gene.getAttribute('g1'),10)||0,parseInt(gene.getAttribute('g2'),10)||0,parseInt(gene.getAttribute('g3'),10)||0];
	  const m = parseInt(gene.getAttribute('m'),10)||100;
	  
	  let geneItem = {		  
		id: geneIndex,
		h: h,
		p: p,
		key: h+":"+p,
		desc:name,
        n: n,
		priorityOrder: n.split(''),
		g: g,
        m: m,
        s: (+gene.getAttribute('s'),10)||1,
		valueMatrix:  precomputeValueMatrix(g,m)
	  };
	  
	 
	  	  
	  geneById.set(geneIndex, geneItem);
	  //geneByHp.set(hp, geneItem);
	  arrayHp[h][p] = geneItem;
	  geneByDesc.set(name, geneItem);
	  geneIndex++;
    });

	//console.log("genIndex: "+geneIndex);

  } catch (e) {
    console.warn('XML load failed', e);
  }
  // Always expose globals



 
  const allEntries = Array.from(geneById.values()).sort((a,b) => a.h - b.h || a.p - b.p);
  window.allEntries = allEntries;
  window.geneById = geneById;
  //window.geneByHp = geneByHp;
  window.geneByDesc = geneByDesc;
  window.arrayHp = arrayHp;
}
//await loadGeneDataFromXml();


//encode_decode dna sequence
(function() {
  const BASE_TO_BITS = {A:0, C:1, G:2, T:3};
  const BITS_TO_BASE = ['A','C','G','T'];

  // Precomputed shift amounts for 2-bit chunks within a byte (0..3)
  const SHIFT = [6,4,2,0];

  function uint8ToBase64url(bytes) {
    let binary = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64urlToUint8(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Validates that each helix has the correct length using HELIX_LENGTHS
  window.encodeSequences = function(linesArray) {

    if (linesArray.length !== (HELIX_LENGTHS.length*2)) throw new Error('Exactly 40 lines are required.');

    // Pre‑compute total bases and validate each line's length
    let totalBases = 0;
    for (let i = 0; i < 40; i++) {
      const line = linesArray[i];
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) throw new Error(`Invalid format at line ${i+1}: missing colon`);
      const numStr = line.substring(0, colonIdx);
      const seq = line.substring(colonIdx + 1);
      if (numStr.length !== 2) throw new Error(`Invalid number at line ${i+1}`);
      const helix = (numStr.charCodeAt(0) - 48) * 10 + (numStr.charCodeAt(1) - 48);
      const expectedLen = HELIX_LENGTHS[helix];
      if (seq.length !== expectedLen) {
        throw new Error(`Line ${numStr} must have length ${expectedLen}, got ${seq.length}`);
      }
      totalBases += seq.length;
    }
    if (totalBases % 2 !== 0) throw new Error('Total bases must be even (two strands per helix)');
    
    const bytesNeeded = Math.ceil(totalBases * 2 / 8);
    const buffer = new Uint8Array(bytesNeeded);
    let bytePos = 0, bitPos = 0; // bitPos 0..3

    for (let i = 0; i < 40; i++) {
      const line = linesArray[i];
      const seq = line.substring(line.indexOf(':') + 1);
      for (let j = 0; j < seq.length; j++) {
        const bits = BASE_TO_BITS[seq[j]];
        if (bits === undefined) throw new Error(`Invalid base '${seq[j]}' at line ${i+1}`);
        buffer[bytePos] |= (bits << SHIFT[bitPos]);
        bitPos++;
        if (bitPos === 4) {
          bitPos = 0;
          bytePos++;
        }
      }
    }
    return uint8ToBase64url(buffer);
  };

  window.decodeToLines = function(encodedStr) {

    const bytes = base64urlToUint8(encodedStr);
    // Calculate total bits required
    const requiredBytes = Math.ceil(GENE_COUNT * 4 / 8);
    if (bytes.length < requiredBytes) throw new Error('Encoded data too short for the expected genome length');
    
    const lines = new Array(40);
    let byteIdx = 0, bitIdx = 0; // bitIdx 0..3
    let lineCounter = 0;

    for (let h = 0; h < 20; h++) {
      const len = HELIX_LENGTHS[h];
      const numStr = (h < 10 ? '0' : '') + h;
      const line1Parts = [numStr + ':'];
      const line2Parts = [numStr + ':'];
      for (let copy = 0; copy < 2; copy++) {
        const target = copy === 0 ? line1Parts : line2Parts;
        for (let j = 0; j < len; j++) {
          if (byteIdx >= bytes.length) throw new Error('Unexpected end of encoded data');
          const bits = (bytes[byteIdx] >> SHIFT[bitIdx]) & 0b11;
          target.push(BITS_TO_BASE[bits]);
          bitIdx++;
          if (bitIdx === 4) {
            bitIdx = 0;
            byteIdx++;
          }
        }
      }
      lines[lineCounter++] = line1Parts.join('');
      lines[lineCounter++] = line2Parts.join('');
    }
    return lines;
  };
})();