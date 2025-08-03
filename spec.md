# 软件需求

## 输入要求

在一个跟目录下存在六个文件夹分别含有一下关键词：

- 衬底
- FAB, CP
- CP, 1
- WLBI
- CP, 2
- AOI (来自AOI程序的 .txt 输出)

> 以上也是叠图进行的顺序\(从上到下\)

**CP map 路径例子：**
![](./assets/images/cp_map_ex.png)

**WLBI map 路径例子：**
![](./assets/images/wlbi_map_ex.png)

**AOI map 路径例子：**
![](./assets/images/aoi_map_ex.png)

### 问题:

- **!!CP、WLBI、AOI的子路径结构都稍有不一样，如果要可靠的自动识别的话需要更具体的路径和命名结构描述**
- **!!自动识别还是用后手动定义，还是两个混合解决方案？**

## 输出要求

- mapEx 格式
- wafermap 格式
- hexmap 格式
- 叠图图片 \(.jpg\)

### 输出文件夹命名：

![](./assets/images/output_folder_name.png)

- 命名格式：型号_批次号_叠图序号

### 输出文件内结构：

![](./assets/images/output_folder.png)

- 文件命名格式：型号_批次号_片号.后缀

### 问题:

- **!! 文件的内部格式\(mapEx, hex, wafermap\)与后缀的关系\(或者用于自定义？更灵活一些\)**
- **!!叠图序号的意义和规则是什么**

## 路径选择的效果图:

![](./assets/images/demo_0/ss_0.png)

根据用户选择的跟目录使用正则表达式来自动识别与选取相应的子目录。自动选取后要是不对的话用户也可以手动修改。


